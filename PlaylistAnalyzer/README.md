# My Enhanced Playlist Insights

## Overview

"My Enhanced Playlist Insights" is a dynamic web application designed to help you visualize and understand your music listening habits. You can manually add your favorite songs, including details like artist, energy level, and the day played, or upload a CSV file with your playlist data. The application then processes this data to provide key insights and interactive charts, revealing patterns in your music taste.

## Features

* **Manual Song Entry:** Easily add individual songs with their artist, energy level (0.0-1.0), and the day they were played.
* **CSV Upload:** Import your playlist data from a CSV file for quick analysis of larger datasets.
* **Playlist Management:** View your current playlist in a searchable table and delete songs as needed.
* **Key Insights:**
    * Identify your top artist.
    * Discover the overall average energy level of your playlist.
    * See which day of the week you listen to the most music.
* **Interactive Data Visualizations:**
    * **Songs Played Per Day:** A bar chart showing the number of songs played on each day of the week.
    * **Average Energy Level Per Day:** A bar chart illustrating the average energy of songs played on specific days.
    * **Playlist Energy Distribution:** A histogram showing the distribution of song energy levels across your entire playlist.
* **Theming:** Toggle between a clean light mode and a sleek, dark blue-themed dark mode.
* **Persistent Data:** Your playlist data and dark mode preference are saved locally in your browser's local storage, so your insights remain even after closing the browser.

## Technologies Used

* **HTML5:** For the core structure of the web application.
* **CSS3 (with CSS Variables):** For styling, theming (light/dark mode), and responsiveness.
* **Tailwind CSS (via CDN):** Used for rapid UI development and utility-first styling.
* **JavaScript (Vanilla JS):** For application logic, DOM manipulation, and data handling.
* **D3.js (v7.8.5):** A powerful JavaScript library for creating interactive data visualizations.

## Getting Started

To run this project locally:

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/YourUsername/YourRepositoryName.git](https://github.com/YourUsername/YourRepositoryName.git)
    ```
    (Replace `YourUsername/YourRepositoryName` with your actual GitHub repository path.)
2.  **Navigate to the project directory:**
    ```bash
    cd YourRepositoryName
    ```
3.  **Open `index.html`:** Simply open the `index.html` file in your web browser. Most modern browsers will allow you to open local HTML files directly.

### CSV File Format

When uploading a CSV, ensure it has at least the following columns (case-sensitive as shown, though `Artist Name 1` is also supported for Artist):

* `Song`
* `Artist` (or `Artist Name 1`)
* `Energy` (a number between 0.0 and 1.0)
* `Day_Played` (e.g., "Monday", "Tuesday", etc.)

If `Energy` or `Day_Played` are missing or invalid, the application will attempt to guess them.

## Project Structure
