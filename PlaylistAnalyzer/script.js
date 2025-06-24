// D3.js CDN is loaded in index.html <head>
// Playlist Analyzer Script - Updated

// --- Global Variables and Data Storage ---
const LOCAL_STORAGE_KEY = 'userPlaylist';
const DARK_MODE_KEY = 'darkModeEnabled'; // Key for dark mode preference
let playlist = []; // This array will hold the current playlist data

// Audio analysis variables
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

// Define the desired order of days for consistent plotting
const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// --- DOM Elements ---
const csvFileInput = document.getElementById('csvFileInput');
const uploadCsvButton = document.getElementById('uploadCsvButton');
const uploadMessage = document.getElementById('uploadMessage');

const songInput = document.getElementById('songInput');
const artistInput = document.getElementById('artistInput');
const energyInput = document.getElementById('energyInput');
const dayInput = document.getElementById('dayInput');
const addSongButton = document.getElementById('addSongButton');
const clearAllDataButton = document.getElementById('clearAllDataButton');
const playlistTableBody = document.getElementById('playlistTableBody');
const noSongsMessage = document.getElementById('noSongsMessage');
const errorMessage = document.getElementById('errorMessage');

// Audio analysis elements
const audioFileInput = document.getElementById('audioFileInput');
const analyzeAudioButton = document.getElementById('analyzeAudioButton');
const audioAnalysisProgress = document.getElementById('audioAnalysisProgress');
const audioAnalysisResult = document.getElementById('audioAnalysisResult');
const audioAnalysisError = document.getElementById('audioAnalysisError');

const topArtistResult = document.getElementById('topArtistResult');
const energyLevelResult = document.getElementById('energyLevelResult');
const dailyMusicStatement = document.getElementById('dailyMusicStatement');
const darkModeToggle = document.getElementById('darkModeToggle'); // Get the new toggle button
// Get the sun and moon icons within the toggle button
const sunIcon = darkModeToggle.querySelector('.sun-icon');
const moonIcon = darkModeToggle.querySelector('.moon-icon');


// --- Local Storage Functions ---
function loadPlaylistFromLocalStorage() {
    const storedPlaylist = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedPlaylist) {
        playlist = JSON.parse(storedPlaylist);
    } else {
        playlist = []; // Initialize as empty if no stored data
    }
}

function savePlaylistToLocalStorage() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(playlist));
}

function loadDarkModePreference() {
    const isDarkMode = localStorage.getItem(DARK_MODE_KEY) === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark');
        // Ensure the correct icon is visible on load
        if (sunIcon) sunIcon.classList.remove('hidden');
        if (moonIcon) moonIcon.classList.add('hidden');
    } else {
        document.body.classList.remove('dark');
        // Ensure the correct icon is visible on load
        if (sunIcon) sunIcon.classList.add('hidden');
        if (moonIcon) moonIcon.classList.remove('hidden');
    }
}

function toggleDarkMode() {
    const isCurrentlyDark = document.body.classList.contains('dark');
    if (isCurrentlyDark) {
        document.body.classList.remove('dark');
        localStorage.setItem(DARK_MODE_KEY, 'false');
        // Show moon icon, hide sun icon
        if (sunIcon) sunIcon.classList.add('hidden');
        if (moonIcon) moonIcon.classList.remove('hidden');
    } else {
        document.body.classList.add('dark');
        localStorage.setItem(DARK_MODE_KEY, 'true');
        // Show sun icon, hide moon icon
        if (sunIcon) sunIcon.classList.remove('hidden');
        if (moonIcon) moonIcon.classList.add('hidden');
    }
    // Re-draw charts to apply new colors
    if (playlist.length > 0) {
        drawSongsPerDayChart();
        drawEnergyPerDayChart();
        drawEnergyDistributionChart();
    }
}


// --- UI Update Functions ---
function updateUI() {
    renderPlaylistTable();
    if (playlist.length > 0) {
        analyzeTopArtist();
        analyzeAverageEnergy();
        analyzeMostPlayedDay();
        drawSongsPerDayChart();
        drawEnergyPerDayChart();
        drawEnergyDistributionChart(); // Call the energy distribution chart function
        hideNoDataMessages(false);
    } else {
        // Clear analysis results and charts if playlist is empty
        topArtistResult.textContent = "No data available.";
        energyLevelResult.textContent = "No data available.";
        dailyMusicStatement.textContent = "No data available.";
        d3.select("#songs-per-day-chart svg").remove();
        d3.select("#energy-per-day-chart svg").remove();
        d3.select("#energy-distribution-chart svg").remove(); // Clear energy distribution chart
        hideNoDataMessages(true);
    }
}

function hideNoDataMessages(show) {
     if (show) {
         noSongsMessage.classList.remove('hidden');
         document.getElementById('playlistTableContainer').classList.add('hidden');
     } else {
         noSongsMessage.classList.add('hidden');
         document.getElementById('playlistTableContainer').classList.remove('hidden');
     }
}

function showErrorMessage(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideErrorMessage() {
    errorMessage.classList.add('hidden');
}

function showUploadMessage(message, isError = false) {
    uploadMessage.textContent = message;
    uploadMessage.className = isError ? 'text-red-600 text-center mt-2' : 'text-green-600 text-center mt-2';
}

function clearUploadMessage() {
    uploadMessage.textContent = '';
    uploadMessage.className = 'text-center mt-2';
}

function renderPlaylistTable() {
    playlistTableBody.innerHTML = ''; // Clear existing rows
    if (playlist.length === 0) {
        hideNoDataMessages(true);
        return;
    } else {
         hideNoDataMessages(false);
    }

    playlist.forEach((song, index) => {
        const row = playlistTableBody.insertRow();
        row.innerHTML = `
            <td>${song.Song || 'N/A'}</td>
            <td>${song.Artist || 'N/A'}</td>
            <td>${(typeof song.Energy === 'number' ? song.Energy.toFixed(2) : 'N/A')}</td>
            <td>${song.Day_Played || 'N/A'}</td>
            <td>
                <button class="btn-danger text-sm px-2 py-1" data-index="${index}">Delete</button>
            </td>
        `;
    });

    // Add event listeners for delete buttons
    playlistTableBody.querySelectorAll('.btn-danger').forEach(button => {
        button.addEventListener('click', (event) => {
            const indexToDelete = parseInt(event.target.dataset.index);
            deleteSong(indexToDelete);
        });
    });
}

// --- Playlist Management Functions ---
function addSong() {
    hideErrorMessage(); // Clear previous error messages

    const song = songInput.value.trim();
    const artist = artistInput.value.trim();
    const energy = parseFloat(energyInput.value);
    const day = dayInput.value;

    // Basic validation
    if (!song || !artist || isNaN(energy) || energy < 0 || energy > 1 || !day) {
        showErrorMessage('Please fill in all fields correctly. Energy must be between 0.0 and 1.0.');
        return;
    }

    const newSong = { Song: song, Artist: artist, Energy: energy, Day_Played: day };
    playlist.push(newSong);
    savePlaylistToLocalStorage();
    updateUI();

    // Clear input fields
    songInput.value = '';
    artistInput.value = '';
    energyInput.value = '';
    dayInput.value = ''; // Reset select to placeholder
}

function deleteSong(index) {
    if (confirm(`Are you sure you want to delete "${playlist[index].Song}"?`)) {
        playlist.splice(index, 1); // Remove song from array
        savePlaylistToLocalStorage();
        updateUI();
    }
}

function clearAllData() {
    if (confirm("Are you sure you want to clear ALL your playlist data? This cannot be undone!")) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        playlist = []; // Clear the in-memory playlist
        updateUI();
        alert("All playlist data has been cleared!");
    }
}

// --- CSV Upload Functions ---
function parseCsv(csvString) {
    // Split into lines, trim whitespace
    const lines = csvString.trim().split(/\r?\n/);
    if (lines.length === 0) return [];

    // Parse header using robust CSV splitting
    const parseLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result.map(s => s.trim());
    };

    const headers = parseLine(lines[0]);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // skip empty lines
        const values = parseLine(lines[i]);
        if (values.length !== headers.length) {
            console.warn(`Skipping malformed row: ${lines[i]}`);
            continue; // Skip rows that don't match header count
        }
        const rowObject = {};
        headers.forEach((header, index) => {
            rowObject[header] = values[index];
        });
        data.push(rowObject);
    }
    return data;
}

function processUploadedPlaylist(rawCsvData) {
    const processedPlaylist = [];
    const knownEnergyMap = {
        'Save Your Tears': 0.7, 'Every Teardrop Is a Waterfall': 0.8, 'Viva la Vida': 0.8,
        'HandClap': 1.0, 'Riptide': 0.5, 'Make You Mine': 0.8, 'Out of My League': 0.9,
        'A Sky Full of Stars': 0.9, 'Blinding Lights': 0.9, 'The Less I Know The Better': 0.6,
        'Fix You': 0.4, 'Mr. Brightside': 0.9, 'Watermelon Sugar': 0.7, 'Sunflower': 0.8,
        'Thunderstruck': 1.0, 'Imagine': 0.3, 'Don\'t Stop Believin\'': 0.9, 'Lovely Day': 0.6,
        'Africa': 0.7, 'Sweet Child o\' Mine': 0.9, 'Again': 0.85 // Added Again by YUI
    };

    rawCsvData.forEach(item => {
        const songTitle = item.Song ? item.Song.trim() : '';
        let artistName = item.Artist ? item.Artist.trim() : '';
        if (!artistName && item['Artist Name 1']) { // Check for 'Artist Name 1' if 'Artist' is missing
            artistName = item['Artist Name 1'].trim();
        }
        let energyLevel = parseFloat(item.Energy);
        let dayPlayed = item.Day_Played ? item.Day_Played.trim() : '';

        // Guess energy if not provided or invalid
        if (isNaN(energyLevel) || energyLevel < 0 || energyLevel > 1) {
            energyLevel = knownEnergyMap[songTitle] || parseFloat((Math.random() * (0.6) + 0.3).toFixed(2)); // Random between 0.3 and 0.9
        }

        // Assign random day if not provided or invalid
        if (!dayPlayed || !daysOrder.includes(dayPlayed)) {
            dayPlayed = daysOrder[Math.floor(Math.random() * daysOrder.length)];
        }

        if (songTitle) { // Only add if song title is present
            processedPlaylist.push({
                Song: songTitle,
                Artist: artistName || 'Unknown Artist',
                Energy: energyLevel,
                Day_Played: dayPlayed
            });
        }
    });
    return processedPlaylist;
}

function handleCsvUpload() {
    clearUploadMessage();
    const file = csvFileInput.files[0];
    if (!file) {
        showUploadMessage('Please select a CSV file to upload.', true);
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const csvString = e.target.result;
            const rawData = parseCsv(csvString);
            const newPlaylist = processUploadedPlaylist(rawData);

            if (newPlaylist.length === 0) {
                showUploadMessage('The uploaded CSV file contains no valid song data.', true);
                return;
            }

            playlist = newPlaylist; // Replace current playlist with uploaded data
            savePlaylistToLocalStorage();
            updateUI();
            showUploadMessage(`Successfully uploaded ${newPlaylist.length} songs from CSV!`);
        } catch (error) {
            console.error("Error processing CSV:", error);
            showUploadMessage('Error processing CSV file. Please ensure it is correctly formatted.', true);
        }
    };

    reader.onerror = () => {
        showUploadMessage('Error reading file. Please try again.', true);
    };

    reader.readAsText(file);
}


// --- Analysis Functions (re-used) ---

function analyzeTopArtist() {
    const artistCounts = {};
    playlist.forEach(item => {
        artistCounts[item.Artist] = (artistCounts[item.Artist] || 0) + 1;
    });

    let topArtist = 'N/A';
    let topArtistCount = 0;

    if (Object.keys(artistCounts).length > 0) {
         // Convert to array of [artist, count] pairs to sort
        const sortedArtists = Object.entries(artistCounts).sort(([,countA], [,countB]) => countB - countA);
        topArtist = sortedArtists[0][0];
        topArtistCount = sortedArtists[0][1];
    }

    topArtistResult.textContent = `${topArtist} (with ${topArtistCount} songs)`;
}

function analyzeAverageEnergy() {
    if (playlist.length === 0) {
        energyLevelResult.textContent = "No data available.";
        return;
    }
    const totalEnergy = playlist.reduce((sum, item) => sum + item.Energy, 0);
    const averageEnergy = totalEnergy / playlist.length;

    let energyMessage = '';
    if (averageEnergy < 0.4) {
        energyMessage = "You're definitely a chill vibe listener.";
    } else if (averageEnergy > 0.6) {
        energyMessage = "Looks like you're ready to power through anything!";
    } else {
        energyMessage = "You've got a balanced mix of vibes going on!";
    }
    energyLevelResult.textContent = `${averageEnergy.toFixed(2)} - ${energyMessage}`;
}

function analyzeMostPlayedDay() {
    if (playlist.length === 0) {
        dailyMusicStatement.textContent = "No data available.";
        return;
    }
    const dayCounts = {};
    playlist.forEach(item => {
        dayCounts[item.Day_Played] = (dayCounts[item.Day_Played] || 0) + 1;
    });

    let mostPlayedDay = 'N/A';
    let maxPlays = 0;
    daysOrder.forEach(day => { // Iterate through ordered days to find max
        const count = dayCounts[day] || 0;
        if (count > maxPlays) {
            maxPlays = count;
            mostPlayedDay = day;
        }
    });

    dailyMusicStatement.textContent = `Most songs (${maxPlays}) were played on ${mostPlayedDay}.`;
}

// --- D3.js Charting Functions ---
const tooltip = d3.select(".tooltip");

function drawChart(containerId, data, xDomainAccessor, yDomainAccessor, yLabel, barColorClass, type = 'songs') {
    const container = document.getElementById(containerId);
    if (!container) return;
    d3.select(`#${containerId} svg`).remove(); // Clear existing SVG on resize or data update

    if (playlist.length === 0) { // Don't draw if no data
        return;
    }

    const margin = { top: 30, right: 30, bottom: 60, left: 50 };
    const containerWidth = container.offsetWidth;
    const width = Math.max(300, containerWidth - margin.left - margin.right); // Ensure min width
    const height = 350 - margin.top - margin.bottom;

    const svg = d3.select(`#${containerId}`)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // X axis
    const x = d3.scaleBand()
        .range([0, width])
        .domain(data.map(d => xDomainAccessor(d)))
        .padding(0.2);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end")
        .style("font-size", "0.9rem")
        .style("fill", "var(--chart-axis-text)"); /* Use CSS variable */

    // Y axis
    const yMax = d3.max(data, d => yDomainAccessor(d));
    const yDomainUpper = (type === 'energy') ? 1 : (yMax === 0 ? 1 : yMax + 1); // For songs, pad a bit, for energy max is 1
    const y = d3.scaleLinear()
        .domain([0, yDomainUpper])
        .range([height, 0]);

    svg.append("g")
        .call(d3.axisLeft(y).tickFormat(type === 'songs' ? d3.format("d") : d3.format(".1f")))
        .selectAll("text")
        .style("fill", "var(--chart-axis-text)"); /* Use CSS variable */

    // Bars
    svg.selectAll(".bar")
        .data(data)
        .enter()
        .append("rect")
        .attr("x", d => x(xDomainAccessor(d)))
        .attr("y", d => y(yDomainAccessor(d)))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(yDomainAccessor(d)))
        .attr("class", `bar ${barColorClass} rounded-t-md`)
        .style("fill", `var(--${barColorClass})`) /* Use CSS variable for initial fill */
        .on("mouseover", function(event, d) {
            d3.select(this).style("fill", `var(--${barColorClass}-hover)`); /* Use CSS variable for hover */
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            tooltip.html(`${xDomainAccessor(d)}: ${yDomainAccessor(d).toFixed(type === 'songs' ? 0 : 2)}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).style("fill", `var(--${barColorClass})`); /* Reset to initial CSS variable */
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });

    // Y-axis label
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "0.9rem")
        .style("fill", "var(--chart-axis-text)") /* Use CSS variable */
        .text(yLabel);

    // Grid lines
    svg.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y).tickSize(-width).tickFormat(""))
        .selectAll("line")
        .style("stroke", "var(--chart-grid)");
}

function drawSongsPerDayChart() {
    const dayCounts = {};
    playlist.forEach(item => {
        dayCounts[item.Day_Played] = (dayCounts[item.Day_Played] || 0) + 1;
    });

    const chartData = daysOrder.map(day => ({
        day: day,
        count: dayCounts[day] || 0
    }));

    drawChart(
        'songs-per-day-chart',
        chartData,
        d => d.day,
        d => d.count,
        'Number of Songs Played',
        'bar-histogram',
        'songs'
    );
}

function drawEnergyPerDayChart() {
    const energySumPerDay = {};
    const energyCountPerDay = {};

    playlist.forEach(item => {
        energySumPerDay[item.Day_Played] = (energySumPerDay[item.Day_Played] || 0) + item.Energy;
        energyCountPerDay[item.Day_Played] = (energyCountPerDay[item.Day_Played] || 0) + 1;
    });

    const chartData = daysOrder.map(day => ({
        day: day,
        averageEnergy: energyCountPerDay[day] > 0 ? energySumPerDay[day] / energyCountPerDay[day] : 0
    }));

    drawChart(
        'energy-per-day-chart',
        chartData,
        d => d.day,
        d => d.averageEnergy,
        'Average Energy Level (0-1)',
        'bar-histogram',
        'energy'
    );
}

// Function to draw Energy Distribution Histogram
function drawEnergyDistributionChart() {
    const container = document.getElementById('energy-distribution-chart');
    if (!container) return;
    d3.select(`#energy-distribution-chart svg`).remove();

    if (playlist.length === 0) {
        return;
    }

    const margin = { top: 30, right: 30, bottom: 60, left: 50 };
    const containerWidth = container.offsetWidth;
    const width = Math.max(300, containerWidth - margin.left - margin.right);
    const height = 350 - margin.top - margin.bottom;

    const svg = d3.select(`#energy-distribution-chart`)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create histogram bins
    const histogram = d3.histogram()
        .value(d => d.Energy)
        .domain([0, 1]) // Energy levels are 0 to 1
        .thresholds(d3.range(0, 1.1, 0.1)); // Bins from 0 to 1, in 0.1 increments

    const bins = histogram(playlist);

    // X axis: Bin ranges
    const x = d3.scaleBand()
        .range([0, width])
        .domain(bins.map(d => `${d.x0.toFixed(1)}-${d.x1.toFixed(1)}`))
        .padding(0.1);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end")
        .style("font-size", "0.9rem")
        .style("fill", "var(--chart-axis-text)"); /* Use CSS variable */

    // Y axis: Count of songs
    const y = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length) + 1]) // +1 for padding
        .range([height, 0]);

    svg.append("g")
        .call(d3.axisLeft(y).tickFormat(d3.format("d")))
        .selectAll("text")
        .style("fill", "var(--chart-axis-text)"); /* Use CSS variable */

    // Bars
    svg.selectAll(".bar-histogram")
        .data(bins)
        .enter()
        .append("rect")
        .attr("x", d => x(`${d.x0.toFixed(1)}-${d.x1.toFixed(1)}`))
        .attr("y", d => y(d.length))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.length))
        .attr("class", "bar bar-histogram rounded-t-md")
        .style("fill", "var(--chart-bar-histogram)") /* Use CSS variable for initial fill */
        .on("mouseover", function(event, d) {
            d3.select(this).style("fill", "var(--chart-bar-histogram-hover)"); /* Use CSS variable for hover */
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            tooltip.html(`Energy: ${d.x0.toFixed(1)}-${d.x1.toFixed(1)}<br>Songs: ${d.length}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).style("fill", "var(--chart-bar-histogram)"); /* Reset to initial CSS variable */
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });

    // Y-axis label
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "0.9rem")
        .style("fill", "var(--chart-axis-text)") /* Use CSS variable */
        .text("Number of Songs");

    // X-axis label
    svg.append("text")
        .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 10})`)
        .style("text-anchor", "middle")
        .style("font-size", "0.9rem")
        .style("fill", "var(--chart-axis-text)") /* Use CSS variable */
        .text("Energy Level Range");

    // Grid lines
    svg.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y).tickSize(-width).tickFormat(""))
        .selectAll("line")
        .style("stroke", "var(--chart-grid)");
}


// --- Audio Analysis Functions ---
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
    audioAnalysisProgress.textContent = 'Loading energy prediction model...';
    try {
        // Use the original trained model
        model = await tf.loadLayersModel('https://raw.githubusercontent.com/DaveDiDon/AIOlympiad2025/main/ml_models/tfjs_model/model.json');
        modelLoaded = true;
        audioAnalysisProgress.textContent = 'Model loaded.';
    } catch (err) {
        audioAnalysisError.textContent = 'Error loading model: ' + err;
        audioAnalysisProgress.textContent = '';
    }
}

async function analyzeAudioFile(file) {
    audioAnalysisError.textContent = '';
    audioAnalysisResult.textContent = '';
    audioAnalysisProgress.textContent = 'Preparing audio file...';
    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        // Decode audio using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        audioAnalysisProgress.textContent = 'Extracting MFCC features...';
        // Extract MFCCs
        const mfccs = extractMFCCs(audioBuffer);
        
        audioAnalysisProgress.textContent = 'Preparing model input...';
        // Pad or truncate to MAX_PAD_LEN
        const paddedMFCCs = padOrTruncateMFCCs(mfccs);
        
        // Convert to tensor and reshape to (1, 40, 174, 1)
        const mfccTensor = tf.tensor4d(paddedMFCCs, [1, N_MFCC, MAX_PAD_LEN, 1]);
        
        audioAnalysisProgress.textContent = 'Running prediction...';
        // Predict energy
        const prediction = await model.predict(mfccTensor).data();
        
        // Display result and populate energy input
        audioAnalysisProgress.textContent = '';
        const energyValue = prediction[0].toFixed(3);
        audioAnalysisResult.textContent = `Predicted Energy Level: ${energyValue}`;
        energyInput.value = energyValue;
        
        // Clean up
        mfccTensor.dispose();
        audioContext.close();
    } catch (err) {
        audioAnalysisError.textContent = 'Error running analysis: ' + err;
        audioAnalysisProgress.textContent = '';
    }
}

// --- Initial Load and Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loadDarkModePreference(); // Load dark mode preference
    loadPlaylistFromLocalStorage(); // Load data first
    updateUI(); // Then update the UI based on loaded data

    addSongButton.addEventListener('click', addSong);
    clearAllDataButton.addEventListener('click', clearAllData);
    uploadCsvButton.addEventListener('click', handleCsvUpload);
    darkModeToggle.addEventListener('click', toggleDarkMode); // Dark mode toggle listener

    // Audio analysis event listener
    analyzeAudioButton.addEventListener('click', async () => {
        if (!audioFileInput.files.length) {
            audioAnalysisError.textContent = 'Please select an audio file.';
            return;
        }
        if (!modelLoaded) {
            await loadTFJSModel();
            if (!modelLoaded) return;
        }
        await analyzeAudioFile(audioFileInput.files[0]);
    });

    // Redraw charts on window resize for responsiveness
    window.addEventListener('resize', () => {
        // Only redraw charts, as other UI elements don't need resize handling
        if (playlist.length > 0) {
            drawSongsPerDayChart();
            drawEnergyPerDayChart();
            drawEnergyDistributionChart(); // Re-draw new chart as well
        }
    });
});
