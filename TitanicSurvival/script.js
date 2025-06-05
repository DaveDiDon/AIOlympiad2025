// script.js
const statusDiv = document.getElementById('status');
const resultDiv = document.getElementById('result');
const predictButton = document.getElementById('predictButton');

// --- CONFIGURATION ---
const MODEL_URL = "https://github.com/DaveDiDon/AIOlympiad2025/blob/main/TitanicSurvival/ml_models/titanic_model.joblib";
const FEATURE_ORDER = ['pclass', 'sex_male', 'age', 'sibsp', 'parch', 'fare']; 

let pyodide = null;
let titanicModel = null;

const defaultBg = 'titanic.gif';
const survivedBg = 'titanic-pass.gif';
const notSurvivedBg = 'titanic-failed.gif';

function setBackground(imageName) {
    document.body.style.backgroundImage = `url('assets/${imageName}')`;
}

function updateStatus(message) {
    statusDiv.textContent = message;
}

function showResult(message, outcomeType = "info") { // outcomeType can be "survived", "not-survived", "error", "info"
    resultDiv.textContent = message;
    resultDiv.style.display = 'block';
    
    // Remove previous classes and add new one
    resultDiv.className = ''; // Clear existing classes
    if (outcomeType === "survived") {
        resultDiv.classList.add('survived');
    } else if (outcomeType === "not-survived") {
        resultDiv.classList.add('not-survived');
    } else if (outcomeType === "error") {
        resultDiv.classList.add('error');
    }
    // For "info", no specific class, relies on default #result styling if any or just plain text.

    if (outcomeType === "error") {
        statusDiv.textContent = "An error occurred.";
    }
}

async function initializePyodideAndLoadModel() {
    setBackground(defaultBg); // Set initial background
    updateStatus("Initializing Pyodide runtime...");
    try {
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
        });
        updateStatus("Pyodide loaded. Loading Python packages...");

        await pyodide.loadPackage(["numpy", "pandas", "scikit-learn", "joblib"]);
        updateStatus("Packages loaded. Fetching model file...");

        let response = await fetch(MODEL_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch model (status ${response.status}). Check MODEL_URL and CORS.`);
        }
        let modelBytes = await response.arrayBuffer();
        updateStatus("Model file fetched. Loading model into Pyodide...");

        pyodide.FS.writeFile("titanic_model.joblib", new Uint8Array(modelBytes), { encoding: "binary" });

        const pythonCodeLoadModel = `
import joblib
model = joblib.load("titanic_model.joblib")
model
        `;
        titanicModel = await pyodide.runPythonAsync(pythonCodeLoadModel);

        if (titanicModel) {
            updateStatus("Model ready! You can now make predictions.");
            predictButton.disabled = false;
            setBackground(defaultBg); // Ensure default background after loading
        } else {
            throw new Error("Model could not be loaded from Python.");
        }

    } catch (error) {
        updateStatus(`Error during initialization: ${error.message}`);
        console.error("Initialization Error:", error);
        showResult(`Initialization failed: ${error.message}. Check console.`, "error");
        setBackground(defaultBg); // Revert to default BG on error
    }
}

async function handlePrediction() {
    if (!pyodide || !titanicModel) {
        showResult("Pyodide or model not yet loaded. Please wait.", "error");
        return;
    }

    setBackground(defaultBg); // Reset to default background when a new prediction starts
    updateStatus("Processing prediction...");
    resultDiv.style.display = 'none';

    try {
        const pclass = parseInt(document.getElementById('pclass').value);
        const sex_male = parseInt(document.getElementById('sex').value);
        const age = parseFloat(document.getElementById('age').value);
        const sibsp = parseInt(document.getElementById('sibsp').value);
        const parch = parseInt(document.getElementById('parch').value);
        const fare = parseFloat(document.getElementById('fare').value);

        if (isNaN(age) || isNaN(sibsp) || isNaN(parch) || isNaN(fare)) { // Pclass and sex are from select, less likely NaN
            showResult("Please fill in all fields with valid numbers.", "error");
            updateStatus("Input error.");
            return;
        }
        
        let inputData = {
            'pclass': pclass, 'sex_male': sex_male, 'age': age,
            'sibsp': sibsp, 'parch': parch, 'fare': fare
        };
        
        pyodide.globals.set("current_input_data_js", pyodide.toPy(inputData));
        // Make the model available in Python global scope if it isn't already (it should be from titanicModel)
        pyodide.globals.set("model", titanicModel); 

        const pythonCodePredict = `
import pandas as pd
# model variable should be globally available in Pyodide from initialization or set by JS
input_dict = current_input_data_js.to_dict() 
input_df = pd.DataFrame([input_dict])

# Ensure columns are in the order the model expects, if necessary.
# Scikit-learn is usually robust if feature names match.
# If you used FEATURE_ORDER during training and saving, you might enforce it:
# feature_order_py = ${JSON.stringify(FEATURE_ORDER)}
# input_df = input_df[feature_order_py]

prediction_array = model.predict(input_df)
prediction_proba_array = model.predict_proba(input_df)

{
    "prediction": int(prediction_array[0]),
    "probability_0": float(prediction_proba_array[0][0]), # Prob of not surviving
    "probability_1": float(prediction_proba_array[0][1])  # Prob of surviving
}
        `;
        
        let predictionResultPy = await pyodide.runPythonAsync(pythonCodePredict);
        let predictionResultJs = predictionResultPy.toJs({ dict_converter: Object.fromEntries });

        let outcome, confidence;
        if (predictionResultJs.prediction === 1) {
            outcome = "Survived";
            confidence = predictionResultJs.probability_1;
            setBackground(survivedBg);
            showResult(`Prediction: ${outcome} (Confidence: ${(confidence * 100).toFixed(1)}%)`, "survived");
        } else {
            outcome = "Not Survived";
            confidence = predictionResultJs.probability_0;
            setBackground(notSurvivedBg);
            showResult(`Prediction: ${outcome} (Confidence: ${(confidence * 100).toFixed(1)}%)`, "not-survived");
        }
        updateStatus("Prediction complete.");

    } catch (error) {
        updateStatus(`Error during prediction: ${error.message}`);
        console.error("Prediction Error:", error);
        showResult(`Prediction failed: ${error.message}. Check console.`, "error");
        setBackground(defaultBg); // Revert to default BG on error
    }
}

document.addEventListener('DOMContentLoaded', () => {
    predictButton.disabled = true;
    predictButton.addEventListener('click', handlePrediction);
    initializePyodideAndLoadModel(); // This will also set initial background
});