// script.js

// --- Constants and DOM Elements ---
const statusMessage = document.getElementById('statusMessage');
const predictionForm = document.getElementById('predictionForm');
const formTitle = document.getElementById('formTitle');
const predictButton = document.getElementById('predictButton');
const cancelUpdateButton = document.getElementById('cancelUpdateButton');
const predictionResultDiv = document.getElementById('predictionResult');
const predictionIdInput = document.getElementById('predictionId'); 

const savedPredictionsListDiv = document.getElementById('savedPredictionsList');
const noSavedPredictionsP = document.getElementById('noSavedPredictions');

const survivalGaugeText = document.getElementById('survivalGaugeText');
const survivalGaugeBar = document.getElementById('survivalGaugeBar');
const gaugeDetailText = document.getElementById('gaugeDetailText');

// --- Configuration ---
const MODEL_URL = "https://raw.githubusercontent.com/DaveDiDon/AIOlympiad2025/main/TitanicSurvival/ml_models/titanic_model.joblib"; 
const FEATURE_ORDER = ['pclass', 'age', 'sibsp', 'parch', 'fare', 'sex_male']; 
const STORAGE_KEY = 'titanicUserPredictions';

const defaultBg = 'assets/titanic.gif';
const survivedBg = 'assets/titanic-pass.gif';
const notSurvivedBg = 'assets/titanic-failed.gif';

let pyodide = null;
let titanicModel = null;
let userPredictions = []; 

// --- Utility Functions ---
function setBackground(imageName) {
    const imgTest = new Image();
    imgTest.onload = () => {
        document.body.style.backgroundImage = `url('${imageName}')`;
    };
    imgTest.onerror = () => {
        console.warn(`Background image ${imageName} not found. Check path 'assets/${imageName}'. Body background will not be set.`);
        document.body.style.backgroundImage = 'none'; 
    };
    imgTest.src = imageName; 
}


function updateStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = isError ? 'text-red-600 mt-2' : 'text-gray-600 mt-2';
}

function showPredictionResult(message, outcomeType = "info") {
    predictionResultDiv.textContent = message;
    predictionResultDiv.style.display = 'block';
    
    predictionResultDiv.className = 'mt-6 p-4 rounded-md text-center font-semibold text-lg '; 
    if (outcomeType === "survived") {
        predictionResultDiv.classList.add('bg-green-100', 'text-green-700');
    } else if (outcomeType === "not-survived") {
        predictionResultDiv.classList.add('bg-red-100', 'text-red-700');
    } else if (outcomeType === "error") {
        predictionResultDiv.classList.add('bg-red-100', 'text-red-700');
    } else { 
            predictionResultDiv.classList.add('bg-blue-100', 'text-blue-700');
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// --- localStorage CRUD ---
function loadPredictionsFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    userPredictions = stored ? JSON.parse(stored) : [];
    renderSavedPredictions();
    updateSurvivalGauge();
}

function savePredictionsToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userPredictions));
    renderSavedPredictions();
    updateSurvivalGauge();
}

// --- Pyodide and Model Initialization ---
async function initializePyodideAndLoadModel() {
    setBackground(defaultBg); 
    updateStatus("Initializing Pyodide runtime...");
    predictButton.disabled = true;
    try {
        pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/" });
        updateStatus("Pyodide loaded. Loading Python packages...");
        await pyodide.loadPackage(["numpy", "pandas", "scikit-learn", "joblib"]);
        updateStatus("Packages loaded. Fetching model file...");

        if (MODEL_URL === "YOUR_MODEL_RAW_GITHUB_URL_HERE.joblib") { 
            throw new Error("MODEL_URL not set. Please update it in the script.");
        }

        let response = await fetch(MODEL_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch model (status ${response.status}). Check MODEL_URL and ensure it's a raw file link with CORS enabled.`);
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
        } else {
            throw new Error("Model could not be loaded from Python.");
        }
    } catch (error) {
        updateStatus(`Initialization Error: ${error.message}`, true);
        console.error("Initialization Error:", error);
        showPredictionResult(`Initialization failed: ${error.message}. Check console.`, "error");
    }
}

// --- Prediction Logic ---
async function makePrediction(inputDataValues) {
    if (!pyodide || !titanicModel) {
        showPredictionResult("Pyodide or model not yet loaded.", "error");
        return null;
    }
    
    pyodide.globals.set("current_input_data_js", pyodide.toPy(inputDataValues));
    pyodide.globals.set("model", titanicModel);
    pyodide.globals.set("expected_feature_order_py", pyodide.toPy(FEATURE_ORDER));

    const pythonCodePredict = `
import pandas as pd
input_dict = current_input_data_js 
input_df_initial = pd.DataFrame([input_dict])
df_feature_order = expected_feature_order_py 
try:
    input_df = input_df_initial[df_feature_order]
except KeyError as e:
    missing_features = set(df_feature_order) - set(input_df_initial.columns)
    extra_features = set(input_df_initial.columns) - set(df_feature_order)
    err_msg = f"Feature mismatch: Missing: {missing_features if missing_features else 'None'}. "
    err_msg += f"Extra in input: {extra_features if extra_features else 'None'}. "
    err_msg += f"DataFrame columns: {list(input_df_initial.columns)}. Expected order: {df_feature_order}. Original error: {e}"
    raise ValueError(err_msg)

prediction_array = model.predict(input_df)
prediction_proba_array = model.predict_proba(input_df)
{
    "prediction": int(prediction_array[0]),
    "probability_not_survived": float(prediction_proba_array[0][0]),
    "probability_survived": float(prediction_proba_array[0][1])
}
    `;
    try {
        let predictionResultPy = await pyodide.runPythonAsync(pythonCodePredict);
        return predictionResultPy.toJs({ dict_converter: Object.fromEntries });
    } catch (pyError) {
        console.error("Python prediction error:", pyError);
        let detailedErrorMessage = pyError.message;
        if (pyError.pythonError && pyError.pythonError.message) { 
            detailedErrorMessage = pyError.pythonError.message;
        }
        showPredictionResult(`Prediction error in Python: ${detailedErrorMessage}`, "error");
        return null;
    }
}

// --- UI Rendering and Updates ---
function updateSurvivalGauge() {
    if (userPredictions.length === 0) {
        survivalGaugeText.textContent = "N/A";
        survivalGaugeBar.style.height = "0%"; 
        survivalGaugeBar.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');
        survivalGaugeBar.classList.add('bg-gray-300');
        gaugeDetailText.textContent = "(Based on 0 predictions)";
        return;
    }

    const survivedCount = userPredictions.filter(p => p.predictionOutcome === "Survived").length;
    const survivalRate = (survivedCount / userPredictions.length) * 100;

    survivalGaugeText.textContent = `${survivalRate.toFixed(1)}%`;
    survivalGaugeBar.style.height = `${survivalRate}%`; 
    gaugeDetailText.textContent = `(${survivedCount} Survived / ${userPredictions.length} Total)`;

    survivalGaugeBar.classList.remove('bg-gray-300', 'bg-red-500', 'bg-yellow-500', 'bg-green-500');
    if (survivalRate >= 75) {
        survivalGaugeBar.classList.add('bg-green-500');
    } else if (survivalRate >= 40) {
        survivalGaugeBar.classList.add('bg-yellow-500');
    } else {
        survivalGaugeBar.classList.add('bg-red-500');
    }
}

function renderSavedPredictions() {
    savedPredictionsListDiv.innerHTML = ''; 
    if (userPredictions.length === 0) {
        noSavedPredictionsP.style.display = 'block';
        return;
    }
    noSavedPredictionsP.style.display = 'none';

    userPredictions.forEach(pred => {
        const card = document.createElement('div');
        card.className = 'p-3 border border-gray-200 rounded-lg shadow-sm bg-gray-50 text-sm'; 
        
        let sexText = pred.features.sex_male === 1 ? "Male" : "Female";
        let outcomeClass = pred.predictionOutcome === "Survived" ? "text-green-700" : "text-red-700";

        card.innerHTML = `
            <h4 class="font-semibold text-blue-700">${pred.name || 'Unnamed Prediction'}</h4>
            <p class="text-xs text-gray-500 mb-1">ID: ...${pred.id.slice(-6)}</p>
            <p class="text-gray-600">
                Class: ${pred.features.pclass}, Sex: ${sexText}, Age: ${pred.features.age}
            </p>
            <p class="text-gray-600">
                SibSp: ${pred.features.sibsp}, Parch: ${pred.features.parch}, Fare: ${pred.features.fare.toFixed(2)}
            </p>
            <p class="font-semibold mt-1 ${outcomeClass}">Outcome: ${pred.predictionOutcome}</p>
            <p class="text-xs text-gray-500">Confidence: ${(pred.confidence * 100).toFixed(1)}%</p>
            <div class="mt-2 space-x-1 text-right">
                <button data-id="${pred.id}" class="update-btn text-xs bg-yellow-400 hover:bg-yellow-500 text-black py-1 px-2 rounded-md">Edit</button>
                <button data-id="${pred.id}" class="delete-btn text-xs bg-red-500 hover:bg-red-600 text-white py-1 px-2 rounded-md">Del</button>
            </div>
        `;
        savedPredictionsListDiv.appendChild(card);
    });
}

function populateFormForUpdate(predictionId) {
    const pred = userPredictions.find(p => p.id === predictionId);
    if (!pred) return;

    document.getElementById('name').value = pred.name || '';
    document.getElementById('pclass').value = pred.features.pclass;
    document.getElementById('sex_male').value = pred.features.sex_male;
    document.getElementById('age').value = pred.features.age;
    document.getElementById('sibsp').value = pred.features.sibsp;
    document.getElementById('parch').value = pred.features.parch;
    document.getElementById('fare').value = pred.features.fare;
    
    predictionIdInput.value = pred.id; 
    formTitle.textContent = "Update Prediction"; // Title for update mode
    predictButton.textContent = "Save Updated Prediction";
    cancelUpdateButton.style.display = 'inline-block';
    setBackground(defaultBg); 
    predictionResultDiv.style.display = 'none';
}

function resetFormToCreateMode(lastPredictionOutcome = null, passengerName = null) {
    predictionForm.reset(); 
    document.getElementById('name').value = ""; 
    document.getElementById('pclass').value = "3"; 
    document.getElementById('sex_male').value = "1";
    document.getElementById('age').value = "30";
    document.getElementById('sibsp').value = "0";
    document.getElementById('parch').value = "0";
    document.getElementById('fare').value = "15.0";

    predictionIdInput.value = ""; 

    if (lastPredictionOutcome && passengerName) {
        if (lastPredictionOutcome === "Survived") {
            formTitle.textContent = `Congratulations, ${passengerName}!`;
        } else if (lastPredictionOutcome === "Not Survived") {
            formTitle.textContent = `Unfortunately, ${passengerName}...`;
        } else {
            formTitle.textContent = "Make New Prediction";
        }
    } else {
        formTitle.textContent = "Make New Prediction";
    }
    
    predictButton.textContent = "Predict Survival";
    cancelUpdateButton.style.display = 'none';
    // Do not hide predictionResultDiv here, it shows the last prediction.
    // If you want to clear it immediately on reset, uncomment the next line:
    // predictionResultDiv.style.display = 'none'; 
    // Background is usually set based on prediction or reset if form is fully cleared for new entry.
    // If coming from a successful prediction, the background reflects that.
    // If "Cancel Update" is clicked, then reset background:
    // setBackground(defaultBg); // This line is now in cancelUpdateButton's handler
}

// --- Event Handlers ---
predictionForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    predictButton.disabled = true;
    const currentPredictionId = predictionIdInput.value;
    const passengerName = document.getElementById('name').value.trim(); 

    if (!passengerName && !currentPredictionId) { 
            showPredictionResult("Passenger Name is required for new predictions.", "error");
            predictButton.disabled = false;
            return;
    }

    const features = {
        pclass: parseInt(document.getElementById('pclass').value),
        sex_male: parseInt(document.getElementById('sex_male').value),
        age: parseFloat(document.getElementById('age').value),
        sibsp: parseInt(document.getElementById('sibsp').value),
        parch: parseInt(document.getElementById('parch').value),
        fare: parseFloat(document.getElementById('fare').value)
    };

    for (const key in features) {
        if (isNaN(features[key])) {
            showPredictionResult(`Invalid input for ${key}. Please enter valid numbers.`, "error");
            predictButton.disabled = false;
            return;
        }
    }
    
    updateStatus(`Processing ${currentPredictionId ? 'updated' : 'new'} prediction...`);
    const predictionData = await makePrediction(features);

    let finalOutcomeTextForTitle = null;

    if (predictionData) {
        const outcomeText = predictionData.prediction === 1 ? "Survived" : "Not Survived";
        finalOutcomeTextForTitle = outcomeText; // Store for title update
        const confidence = predictionData.prediction === 1 ? predictionData.probability_survived : predictionData.probability_not_survived;
        
        showPredictionResult(`Prediction for ${passengerName || 'Selected Passenger'}: ${outcomeText} (Confidence: ${(confidence * 100).toFixed(1)}%)`, outcomeText.toLowerCase().replace(' ', '-'));
        setBackground(outcomeText === "Survived" ? survivedBg : notSurvivedBg);
        
        const predictionRecord = {
            id: currentPredictionId || generateId(),
            name: passengerName, 
            features: features,
            predictionOutcome: outcomeText,
            confidence: confidence,
            timestamp: new Date().toISOString()
        };

        if (currentPredictionId) { 
            const index = userPredictions.findIndex(p => p.id === currentPredictionId);
            if (index !== -1) userPredictions[index] = predictionRecord;
            updateStatus("Prediction updated and saved!");
        } else { 
            userPredictions.push(predictionRecord);
            updateStatus("New prediction saved!");
        }
        savePredictionsToStorage();
        resetFormToCreateMode(finalOutcomeTextForTitle, passengerName || "Passenger"); 
    } else {
            updateStatus("Prediction failed. See message above.", true);
            resetFormToCreateMode(); // Reset form even on failure, but keep default title
    }
    predictButton.disabled = false;
});

cancelUpdateButton.addEventListener('click', () => {
    resetFormToCreateMode(); // This will set title to "Make New Prediction"
    setBackground(defaultBg); // Explicitly reset background
    predictionResultDiv.style.display = 'none'; // Hide any previous result
});

savedPredictionsListDiv.addEventListener('click', function(event) {
    const target = event.target;
    const predictionId = target.dataset.id;

    if (target.classList.contains('delete-btn') && predictionId) {
        const predToDelete = userPredictions.find(p => p.id === predictionId);
        if (confirm(`Are you sure you want to delete prediction for ${predToDelete.name || `ID ...${predictionId.slice(-6)}`}?`)) {
            userPredictions = userPredictions.filter(p => p.id !== predictionId);
            savePredictionsToStorage();
            showPredictionResult("Prediction deleted.", "info");
            setBackground(defaultBg);
            resetFormToCreateMode(); // Reset form title to default
        }
    } else if (target.classList.contains('update-btn') && predictionId) {
        populateFormForUpdate(predictionId);
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
    }
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    predictButton.disabled = true; 
    resetFormToCreateMode(); 
    loadPredictionsFromStorage(); 
    initializePyodideAndLoadModel(); 
});