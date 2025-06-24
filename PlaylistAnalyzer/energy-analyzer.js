// energy-analyzer.js

// Elements
const audioFileInput = document.getElementById('audioFileInput');
const analyzeButton = document.getElementById('analyzeButton');
const progressMessage = document.getElementById('progressMessage');
const energyResult = document.getElementById('energyResult');
const errorMessage = document.getElementById('errorMessage');

let model = null;
let modelLoaded = false;

// MFCC parameters
const N_MFCC = 40;
const MAX_PAD_LEN = 174;
const SAMPLE_RATE = 22050; // Standard sample rate for audio processing
const N_FFT = 2048;
const HOP_LENGTH = 512;
const N_MELS = 128;

// Mel filterbank matrix (pre-computed for efficiency)
let melFilterbank = null;

function createMelFilterbank() {
    if (melFilterbank) return melFilterbank;
    
    // Create mel filterbank matrix
    const fftFreqs = tf.linspace(0, SAMPLE_RATE / 2, Math.floor(N_FFT / 2) + 1);
    const melFreqs = tf.linspace(
        tf.scalar(2595 * Math.log10(1 + 700 / 700)),
        tf.scalar(2595 * Math.log10(1 + SAMPLE_RATE / 2 / 700)),
        N_MELS + 2
    );
    
    const melFreqsHz = tf.sub(tf.pow(tf.scalar(10), tf.div(melFreqs, tf.scalar(2595))), tf.scalar(1)).mul(tf.scalar(700));
    
    // Create triangular filters
    const weights = tf.zeros([N_MELS, fftFreqs.shape[0]]);
    const melFreqsHzData = melFreqsHz.dataSync();
    const fftFreqsData = fftFreqs.dataSync();
    
    for (let i = 0; i < N_MELS; i++) {
        const left = melFreqsHzData[i];
        const center = melFreqsHzData[i + 1];
        const right = melFreqsHzData[i + 2];
        
        for (let j = 0; j < fftFreqsData.length; j++) {
            const freq = fftFreqsData[j];
            if (freq >= left && freq <= center) {
                weights.bufferSync().set((freq - left) / (center - left), i, j);
            } else if (freq > center && freq <= right) {
                weights.bufferSync().set((right - freq) / (right - center), i, j);
            }
        }
    }
    
    melFilterbank = weights;
    return melFilterbank;
}

function extractMFCCs(audioBuffer) {
    // Resample to target sample rate if needed
    const originalSampleRate = audioBuffer.sampleRate;
    let audioData = audioBuffer.getChannelData(0); // Get mono audio
    
    // Simple resampling (for production, use a proper resampling library)
    if (originalSampleRate !== SAMPLE_RATE) {
        const ratio = SAMPLE_RATE / originalSampleRate;
        const newLength = Math.floor(audioData.length * ratio);
        const resampled = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const srcIndex = Math.floor(i / ratio);
            resampled[i] = audioData[srcIndex] || 0;
        }
        audioData = resampled;
    }
    
    // Compute STFT
    const stftFrames = [];
    for (let i = 0; i <= audioData.length - N_FFT; i += HOP_LENGTH) {
        const frame = audioData.slice(i, i + N_FFT);
        // Apply window function (Hann window)
        for (let j = 0; j < N_FFT; j++) {
            frame[j] *= 0.5 * (1 - Math.cos(2 * Math.PI * j / (N_FFT - 1)));
        }
        stftFrames.push(frame);
    }
    
    // Compute power spectrum for each frame
    const melSpectrogram = [];
    for (const frame of stftFrames) {
        // Compute FFT (simplified - in production, use a proper FFT library)
        const fft = new Float32Array(N_FFT);
        for (let k = 0; k < N_FFT; k++) {
            let real = 0, imag = 0;
            for (let n = 0; n < N_FFT; n++) {
                const angle = -2 * Math.PI * k * n / N_FFT;
                real += frame[n] * Math.cos(angle);
                imag += frame[n] * Math.sin(angle);
            }
            fft[k] = Math.sqrt(real * real + imag * imag);
        }
        
        // Apply mel filterbank
        const filterbank = createMelFilterbank();
        const melFrame = tf.matMul(filterbank, tf.tensor1d(fft.slice(0, Math.floor(N_FFT / 2) + 1)));
        melSpectrogram.push(melFrame.dataSync());
    }
    
    // Convert to log scale
    const logMelSpectrogram = melSpectrogram.map(frame => 
        frame.map(val => Math.log(Math.max(val, 1e-10)))
    );
    
    // Compute MFCCs using DCT
    const mfccs = [];
    for (const frame of logMelSpectrogram) {
        const mfccFrame = new Float32Array(N_MFCC);
        for (let i = 0; i < N_MFCC; i++) {
            let sum = 0;
            for (let j = 0; j < frame.length; j++) {
                sum += frame[j] * Math.cos(Math.PI * i * (2 * j + 1) / (2 * frame.length));
            }
            mfccFrame[i] = sum;
        }
        mfccs.push(mfccFrame);
    }
    
    return mfccs;
}

function padOrTruncateMFCCs(mfccs) {
    const padded = new Array(MAX_PAD_LEN);
    
    for (let i = 0; i < MAX_PAD_LEN; i++) {
        if (i < mfccs.length) {
            padded[i] = mfccs[i];
        } else {
            // Pad with zeros
            padded[i] = new Float32Array(N_MFCC);
        }
    }
    
    return padded;
}

async function loadTFJSModel() {
    progressMessage.textContent = 'Loading energy prediction model...';
    try {
        // Use the original trained model
        model = await tf.loadLayersModel('https://raw.githubusercontent.com/DaveDiDon/AIOlympiad2025/main/ml_models/tfjs_model/model.json');
        modelLoaded = true;
        progressMessage.textContent = 'Model loaded.';
    } catch (err) {
        errorMessage.textContent = 'Error loading model: ' + err;
        progressMessage.textContent = '';
    }
}

async function analyzeAudioFile(file) {
    errorMessage.textContent = '';
    energyResult.textContent = '';
    progressMessage.textContent = 'Preparing audio file...';
    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        // Decode audio using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        progressMessage.textContent = 'Extracting MFCC features...';
        // Extract MFCCs
        const mfccs = extractMFCCs(audioBuffer);
        
        progressMessage.textContent = 'Preparing model input...';
        // Pad or truncate to MAX_PAD_LEN
        const paddedMFCCs = padOrTruncateMFCCs(mfccs);
        
        // Convert to tensor and reshape to (1, 40, 174, 1)
        const mfccTensor = tf.tensor4d(paddedMFCCs, [1, N_MFCC, MAX_PAD_LEN, 1]);
        
        progressMessage.textContent = 'Running prediction...';
        // Predict energy
        const prediction = await model.predict(mfccTensor).data();
        
        // Display result
        progressMessage.textContent = '';
        energyResult.textContent = `Predicted Energy Level: ${prediction[0].toFixed(3)}`;
        
        // Clean up
        mfccTensor.dispose();
        audioContext.close();
    } catch (err) {
        errorMessage.textContent = 'Error running analysis: ' + err;
        progressMessage.textContent = '';
    }
}

analyzeButton.addEventListener('click', async () => {
    errorMessage.textContent = '';
    energyResult.textContent = '';
    if (!audioFileInput.files.length) {
        errorMessage.textContent = 'Please select an audio file.';
        return;
    }
    if (!modelLoaded) {
        await loadTFJSModel();
        if (!modelLoaded) return;
    }
    await analyzeAudioFile(audioFileInput.files[0]);
}); 