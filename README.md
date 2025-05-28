# GSheets Route Optimizer: Automated Payment Calculation

Google Sheets automation for calculating optimized payments for technical service visits, using dynamic route analysis via the Google Maps Routes API. This script helps determine fair payment by considering if multiple service locations for a technician on a single day constitute an efficient route.

## Features

* **Automatic Payment Calculation:** Calculates service payment based on pre-defined distance tables for single/final destinations.
* **Dynamic Route Optimization:** For multiple visits by the same technician on the same day:
    * Identifies the farthest city as the "final destination."
    * Uses Google Maps **Routes API** (which provides functionality similar to and superseding the traditional Distance Matrix API) to get real driving distances from the base city and between service cities.
    * Determines if intermediate cities are "on the way" by calculating route deviation.
    * Adjusts payment: minimum value for "on the way" cities, full value for others.
* **Service Type Differentiation:** Calculates different rates for Standard and SVD (Special Visit Designation - or your preferred term) service visits.
* **Google Maps Routes API Integration:** Leverages the Routes API for accurate driving distances to analyze routes.
* **Caching System:** Caches API responses for 6 hours to reduce API calls, speed up subsequent calculations, and manage costs.
* **Automatic Trigger:** Runs automatically when relevant cells in the Google Sheet are edited (via `onEdit` simple trigger).

## How It Works

When a user edits specific columns in a Google Sheet (typically City, Date, Notes/OBS, or Technician), the script:

1.  Identifies all service visits for the **same technician** on the **same date**.
2.  **If it's a single visit for the day:**
    * The payment is calculated using an internal, pre-defined distance table (`DISTANCES` object in the script) and corresponding price tiers.
3.  **If there are multiple visits for the day:**
    * The script determines the driving distance from your `BASE_CITY` to each service city using the Google Maps Routes API.
    * The city furthest from `BASE_CITY` is designated as the "final destination" for that day's route.
    * For each other "intermediate" city, the script calculates the additional driving distance required to visit it in relation to the route to the "final destination".
    * **Payment Logic:**
        * The "final destination" city always receives its full calculated value (based on the internal `DISTANCES` table).
        * An "intermediate" city receives a **minimum fixed value** if the detour to visit it (compared to going directly to the final destination) is small (e.g., less than a 25% increase in total travel distance from the base).
        * If the detour is significant, the "intermediate" city also receives its full calculated value.
4.  The script then updates the "Payment" column for all relevant rows.

## Configuration (Inside the Script File - `your_script_name.js`)

**Crucial:** You MUST configure these constants at the top of the script file.

1.  **`API_KEY`**:
    * Set your Google Maps Routes API Key. This key needs to have the "Routes API" enabled in your Google Cloud Project and be associated with an active billing account (though usage will likely fall within the free tier).
    ```javascript
    const API_KEY = "YOUR_ACTUAL_API_KEY_HERE";
    ```

2.  **`BASE_CITY`**:
    * Define the city and region (e.g., "Toronto, ON, Canada" or "João Monlevade, MG, Brazil") from which all your routes originate. This is used for Google Maps API calls.
    ```javascript
    const BASE_CITY = "Toronto, ON, Canada"; // Example
    ```

3.  **`DISTANCES` Object (Internal Reference Table)**:
    * This table is used to calculate the *final payment value* for a city (single visit, furthest city, or non-route city). It's a manual list of cities and their reference distances (in kilometers) from your base. The API is used for *route analysis*, but the *payment value* uses these fixed distances.
    * Keys should be the city names as they are typically entered in your spreadsheet (case-insensitive matching is applied by the script).
    ```javascript
    const DISTANCES = {
      // City names should be in ALL CAPS for reliable matching
      "TORONTO": 1, // Or 0 if it's the base
      "MISSISSAUGA": 30,
      "BRAMPTON": 45,
      "HAMILTON": 70
      // Add your common service cities and their reference distances in KM
    };
    ```

4.  **Column Mapping (`COL` Object)**:
    * Adjust the column numbers if your spreadsheet layout is different. This script is configured for the following by default:
        * City: Column C
        * Date: Column D
        * Value (Output): Column E
        * Notes (for SVD): Column F
        * Technician: Column G
    ```javascript
    const COL = { 
      CITY: 3,        // Column C for City
      DATE: 4,        // Column D for Date
      VALUE: 5,       // Column E for Payment (output)
      NOTES: 6,       // Column F for Notes (e.g., "SVD")
      TECHNICIAN: 7   // Column G for Technician
    };
    ```

5.  **Pricing Tiers and Keywords**:
    * `SVD_KEYWORD`: The text used in the `NOTES` column (Column F by default) to trigger special pricing (default: "SVD").
    * `calculateStandardValue(km)` and `calculateSvdValue(km)` functions: The price brackets and amounts are defined directly within the `calculateFullServiceValue` function in the script. You can customize these to match your payment structure.

## Spreadsheet Structure (Expected by Default Configuration)

* **Column C:** City where the service visit occurred.
* **Column D:** Date of the service.
* **Column E:** Payment amount (this column will be automatically filled by the script).
* **Column F:** Notes / Observations (enter `SVD` here to trigger special SVD pricing).
* **Column G:** Technician's name.

**Important:** Data entries are expected to start from **row 4**. The first 3 rows are assumed to be headers.

## Setup Instructions

1.  **Open your Google Sheet.**
2.  Go to **Extensions > Apps Script**.
3.  Delete any existing code in the default `Code.gs` file.
4.  **Copy** the entire content of the script provided (e.g., from `your_script_name.js` in your GitHub repository) and **paste** it into the Apps Script editor.
5.  **Configure the Constants:** At the top of the script, carefully set your `API_KEY`, `BASE_CITY`, update the `DISTANCES` object, and verify/adjust the `COL` mapping to match your sheet. Customize pricing tiers within the `calculateFullServiceValue` function if needed.
6.  **Save the Project:** Click the floppy disk icon (💾).
7.  **Enable `appsscript.json` Manifest File:**
    * In the Apps Script editor, click the **Project Settings** icon (⚙️) on the left.
    * Check the box **"Show "appsscript.json" manifest file in editor"**. This is crucial for setting necessary script properties.
8.  **Configure `appsscript.json`:**
    * Go back to the **Editor** (`< >`). A file named `appsscript.json` will now be visible in the file list.
    * Click on it and replace its entire content with:
        ```json
        {
          "timeZone": "America/Sao_Paulo", // Adjust to your timezone if needed
          "dependencies": {},
          "exceptionLogging": "STACKDRIVER",
          "runtimeVersion": "V8",
          "executionApi": {
            "access": "ANYONE"
          }
        }
        ```
    * Save the `appsscript.json` file (💾).
9.  **Authorize the Script:** The first time the script tries to run (e.g., after you edit a cell, or if you manually run the `onEdit` function from the editor once by selecting it and clicking ▶️ **Executar**), Google will ask for authorization. Follow the prompts: `Review permissions` > Choose your account > `Advanced` (if it appears) > `Go to ... (unsafe)` > `Allow`.
10. **Start Using:** Edit the relevant columns (City, Date, Notes, Technician) in your sheet. The "Payment" column should update automatically.

## Requirements

* A Google Account.
* Google Sheet where you want to implement the automation.
* A Google Cloud Platform (GCP) Project:
    * **Routes API** enabled (this API provides distance calculation functionalities, effectively replacing the older Distance Matrix API for this use case).
    * An **API Key** generated from this GCP project, restricted to **only** the Routes API for security.
    * The GCP project must be linked to an **active Billing Account** (the Routes API requires this, but usage for this script's volume will likely stay within Google's monthly free tier).

## Notes

* **API Key Security:** Never commit your actual API Key to a public version control system. For personal use in Google Apps Script where the script is bound to your sheet, paste it directly into the script file.
* **API Costs:** While the script uses caching and is designed for moderate use (a few dozen route calculations per day), be aware that Google Maps Platform API usage can incur costs if it exceeds the generous monthly free tier provided by Google (currently around $200 USD per month). Always monitor your usage and billing in the Google Cloud Console.
* **City Name Accuracy:** For the best results with the Google Maps Routes API, ensure city names entered in the spreadsheet are as accurate and unambiguous as possible (e.g., "City, State/Province, Country" if necessary, especially for cities with common names). The internal `DISTANCES` table (used for final payment calculation) relies on an exact, though case-insensitive, match to its keys (e.g., "TORONTO", "MISSISSAUGA").
* **Script Execution Time:** Calculations involving multiple API calls (for multi-stop routes) might take a few seconds to complete. The script includes a short `Utilities.sleep(1500)` before processing to ensure the user has finished typing, but the overall execution time will depend on the number of API calls and the Google Maps API response time.
* **Error Handling:** The script includes basic error handling for API calls and city lookups. Check the Apps Script execution logs (`Extensions > Apps Script > Executions`) if you encounter unexpected behavior or values not being set.

## Example Usage (Conceptual)

Let's say you have the following configured in your script:

```javascript
// Inside the script, you would configure:
const BASE_CITY = "Toronto, ON, Canada";

const DISTANCES = {
  "TORONTO": 1,         // km from base for payment calculation
  "MISSISSAUGA": 30,    // km from base for payment calculation
  "BRAMPTON": 45,       // km from base for payment calculation
  "HAMILTON": 70        // km from base for payment calculation
};

// And your pricing tiers are set, for example, so that:
// - Up to 50km = $140 (standard)
// - "On the way" (minimum) = $140 (standard)
// - 51km to 100km = $260 (standard)

//###################################################################################//

Scenario: A technician, based in Toronto, has two service calls on the same day:

First, they go to Mississauga.
Then, they go to Hamilton.
How the script would work:

When you enter the Mississauga visit, if it's the only one for the day so far, it gets its full value (e.g., based on 30km, it would be $140).
When you then enter the Hamilton visit for the same technician and day:
The script identifies Hamilton as the furthest city from Toronto (using real driving distances from the API).
It then calculates if Mississauga is a significant detour from the Toronto -> Hamilton route by comparing:
(Distance Toronto -> Mississauga) + (Distance Mississauga -> Hamilton)
versus (Distance Toronto -> Hamilton directly)
Let's assume the API says:
Toronto -> Mississauga: ~32 km
Mississauga -> Hamilton: ~40 km
Toronto -> Hamilton: ~70 km
The detour calculation would be ((32 + 40) / 70) - 1 = (72 / 70) - 1 = 1.028 - 1 = 0.028 (or 2.8%).
Since 2.8% is less than the 25% threshold, Mississauga is considered "on the way".
Final Payments:
Hamilton: Gets its full value based on the 70km from the DISTANCES table (e.g., $260, assuming it falls into the 51-100km tier).
Mississauga: Its payment is adjusted to the minimum value (e.g., $140).

//###################################################################################//

Customization
Pricing Tiers: The payment brackets and amounts for Standard and SVD services are defined directly within the calculateStandardValue(km) and calculateSvdValue(km) functions (which are inside calculateFullServiceValue). You can easily adjust these if/else if conditions.
Minimum ("On the Way") Values: The fixed minimum values (e.g., 140 or 290) are set within the processDailyJobs function. Search for const valorMinimo = ehSVD ? 290 : 140; (ou, em inglês, const minimumValue = isSVD ? 290 : 140;) and adjust as needed.
Route Deviation Tolerance: The percentage used to determine if a city is "on the way" (currently 0.25 or 25%) can be adjusted in the processDailyJobs function. Look for the line: if (detourPercentage < 0.25 && detourPercentage >= -0.05).
SVD_KEYWORD: You can change the keyword used in the "Notes" column to trigger SVD pricing by modifying the SVD_KEYWORD constant at the top of the script.
DISTANCES Table: This internal table must be maintained by you with the reference distances (in km) from your BASE_CITY to your common service locations. This is used for the final price calculation tier, not for the API route analysis.

//###################################################################################//

License
This project is licensed under the MIT License — see the LICENSE file for details.

//###################################################################################//

Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change. Please ensure any contributions maintain clarity and align with the project's goal of providing a flexible routing and payment calculation tool.

//###################################################################################//

Contact
If you have questions, suggestions, or encounter issues, feel free to open an issue on the GitHub repository for this project.
