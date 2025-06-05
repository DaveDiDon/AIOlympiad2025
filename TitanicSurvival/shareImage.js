// shareImage.js

function generateAndDownloadPredictionImage(predictionData) {
    if (!predictionData) {
        alert("No prediction data provided to generate image.");
        return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // --- Image Dimensions and Styling ---
    const canvasWidth = 600;
    const canvasHeight = 450; // Increased height for more content
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Background
    ctx.fillStyle = '#f0f8ff'; // AliceBlue background
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Border
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 5;
    ctx.strokeRect(2.5, 2.5, canvasWidth - 5, canvasHeight - 5);

    let yPos = 50; // Starting Y position for text

    // Title
    ctx.fillStyle = '#004085'; // Dark blue
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🚢 Titanic Survival Prediction 🚢', canvasWidth / 2, yPos);
    yPos += 50;

    // Passenger Name
    ctx.fillStyle = '#333';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Passenger: ${predictionData.name || 'N/A'}`, canvasWidth / 2, yPos);
    yPos += 35;

    // Input Features
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    let xPosFeatures = 50;
    
    const features = predictionData.features;
    function drawFeature(label, value) {
        if (yPos > canvasHeight - 60) { // Simple check to prevent overflow, switch column
            yPos = 135; // Reset yPos for second column
            xPosFeatures = canvasWidth / 2 + 10;
        }
        ctx.fillText(`${label}:`, xPosFeatures, yPos);
        ctx.fillText(value, xPosFeatures + 150, yPos); // Value aligned
        yPos += 25;
    }

    drawFeature('Passenger Class', features.pclass);
    drawFeature('Sex', features.sex_male === 1 ? 'Male' : 'Female');
    drawFeature('Age', features.age);
    drawFeature('Siblings/Spouses', features.sibsp);
    drawFeature('Parents/Children', features.parch);
    drawFeature('Fare Paid', features.fare.toFixed(2));
    
    // Reset yPos if it went into a second column and there's not much space left
    // Or adjust initial yPos for outcome based on where features ended.
    // For simplicity, let's just add a larger gap for outcome.
    if (xPosFeatures > 50) yPos = Math.max(yPos, 135 + 6*25); // Ensure yPos is below features if in 2nd col
    else yPos += 10; // Extra space if still in first column

    // Prediction Outcome
    yPos += 20; // More space before the outcome
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    if (predictionData.predictionOutcome === "Survived") {
        ctx.fillStyle = '#155724'; // Dark Green
        ctx.fillText(`🎉 Predicted: Survived! 🎉`, canvasWidth / 2, yPos);
    } else {
        ctx.fillStyle = '#721c24'; // Dark Red
        ctx.fillText(`😥 Predicted: Not Survived 😥`, canvasWidth / 2, yPos);
    }
    yPos += 30;

    // Confidence
    ctx.fillStyle = '#555';
    ctx.font = 'italic 18px Arial';
    ctx.fillText(`Confidence: ${(predictionData.confidence * 100).toFixed(1)}%`, canvasWidth / 2, yPos);
    yPos += 40;

    // Footer/Timestamp (optional)
    ctx.fillStyle = '#777';
    ctx.font = '12px Arial';
    const date = new Date(predictionData.timestamp);
    ctx.fillText(`Generated: ${date.toLocaleString()}`, canvasWidth / 2, canvasHeight - 20);


    // --- Trigger Download ---
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    const safeName = (predictionData.name || 'passenger').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.download = `titanic_prediction_${safeName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
