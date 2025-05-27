/**
 * VERSION WITH ROUTE ANALYSIS - GOOGLE MAPS API
 * This script checks if multiple service calls for a technician on the same day
 * form a logical route starting from a base city.
 * * Designed for a spreadsheet with columns:
 * C: City | D: Date | E: Value (output) | F: Notes (e.g., "SVD") | G: Technician
 */

// ------------------- USER CONFIGURATION: PASTE YOUR API KEY HERE (BETWEEN THE QUOTES) -------------------
const API_KEY = "PASTE_YOUR_API_KEY_HERE"; // Replace with your actual Distance Matrix API key
// -----------------------------------------------------------------------------------------------------------

// --- SPREADSHEET COLUMN CONFIGURATION ---
// Adjust these numbers if your column layout is different.
const COL = { 
  CITY: 3,        // Column C
  DATE: 4,        // Column D
  VALUE: 5,       // Column E (Where the calculated value is inserted)
  NOTES: 6,       // Column F (Where "SVD" or other keywords are written for special pricing)
  TECHNICIAN: 7   // Column G
}; 

// --- BUSINESS LOGIC CONFIGURATION ---
const SVD_KEYWORD = "SVD"; // Keyword in the NOTES column that triggers SVD pricing
const BASE_CITY = "Toronto"; // IMPORTANT: Customize this to your actual base city for API route calculations

function onEdit(e) {
  Logger.log("--- onEdit TRIGGERED ---");
  if (!e || !e.range) {
    Logger.log("EXITING onEdit: Event object 'e' or 'e.range' is invalid.");
    return;
  }
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const row = range.getRow();
  const col = range.getColumn();
  Logger.log(`onEdit INFO: Sheet='${sheet.getName()}', Cell=${range.getA1Notation()}`);

  if (row <= 3) { // Assuming first 3 rows are headers
    Logger.log(`EXITING onEdit: Edit in header row ${row}.`);
    return;
  }
  
  const triggerColumns = [COL.CITY, COL.DATE, COL.NOTES, COL.TECHNICIAN];
  if (!triggerColumns.includes(col)) {
    Logger.log(`EXITING onEdit: Edit in column ${col}. Not a trigger column (expected one of ${triggerColumns.join(',')}).`);
    return;
  }

  Logger.log("onEdit INFO: Initial checks passed. Calling processDailyJobs...");
  Utilities.sleep(1500); // Strategic pause to ensure user finished typing
  processDailyJobs(sheet, row);
}

/**
 * Processes all service calls for a specific technician on a specific day.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The active sheet.
 * @param {number} editedRow The row number that was edited and triggered the process.
 */
function processDailyJobs(sheet, editedRow) {
  Logger.log(`--- processDailyJobs STARTED for row: ${editedRow} on sheet "${sheet.getName()}" ---`);
  if (API_KEY === "PASTE_YOUR_API_KEY_HERE" || API_KEY.trim() === "") {
    Logger.log("ERROR in processDailyJobs: API Key not configured in the script.");
    sheet.getRange(editedRow, COL.VALUE).setValue("ERROR: API Key not configured.");
    return;
  }
  
  const allSheetData = sheet.getDataRange().getValues();
  const editedRowData = allSheetData[editedRow - 1]; 
  const targetDateObject = new Date(editedRowData[COL.DATE - 1]);
  const targetTechnician = editedRowData[COL.TECHNICIAN - 1];

  if (!targetTechnician || isNaN(targetDateObject.getTime())) {
    Logger.log("ERROR in processDailyJobs: Technician or Date is invalid or not found in row " + editedRow);
    return;
  }
  const targetDateString = targetDateObject.toDateString();
  Logger.log(`INFO in processDailyJobs: Target Technician='${targetTechnician}', Target Date='${targetDateString}'`);

  const jobsOfTheDay = allSheetData
    .map((rowData, index) => ({ data: rowData, originalIndex: index }))
    .filter(item => {
      const itemDateObject = new Date(item.data[COL.DATE - 1]);
      return item.data[COL.TECHNICIAN - 1] === targetTechnician && 
             !isNaN(itemDateObject.getTime()) && 
             itemDateObject.toDateString() === targetDateString;
    })
    .map(item => ({
      row: item.originalIndex + 1, // Actual row number in the sheet
      city: item.data[COL.CITY - 1].toString().trim(), // Ensure city is a string and trimmed
      notes: item.data[COL.NOTES - 1]
    }));

  Logger.log(`INFO in processDailyJobs: ${jobsOfTheDay.length} job(s) found for the day.`);
  if (jobsOfTheDay.length === 0) {
      Logger.log("EXITING processDailyJobs: No jobs found for this technician/date.");
      return;
  }
  
  if (jobsOfTheDay.length === 1) {
    const singleJob = jobsOfTheDay[0];
    Logger.log(`INFO in processDailyJobs: Calculating value for single job in ${singleJob.city}.`);
    const value = calculateFullServiceValue(singleJob.city, singleJob.notes);
    sheet.getRange(singleJob.row, COL.VALUE).setValue(value);
    Logger.log("INFO in processDailyJobs: Single job value set: " + value);
    return;
  }

  Logger.log("INFO in processDailyJobs: Starting route logic for multiple jobs...");
  const jobsWithDistances = jobsOfTheDay.map(job => ({ 
    ...job, 
    distanceFromBase: getMapsDistance(BASE_CITY, job.city) // API call uses city name directly from sheet
  }));
  Logger.log("INFO in processDailyJobs: Distances from Maps API obtained for all jobs.");

  const furthestJob = jobsWithDistances.sort((a, b) => b.distanceFromBase - a.distanceFromBase)[0];
  Logger.log(`INFO in processDailyJobs: Furthest city is ${furthestJob.city} (${furthestJob.distanceFromBase}m)`);
  
  for (const currentJob of jobsWithDistances) {
    let finalValue;
    const isSVD = currentJob.notes.toString().toUpperCase().trim() === SVD_KEYWORD;
    const minimumValue = isSVD ? 290 : 140; 

    if (currentJob.row === furthestJob.row) { 
      finalValue = calculateFullServiceValue(currentJob.city, currentJob.notes);
      Logger.log(`- ${currentJob.city} (furthest destination) gets full value: ${finalValue}`);
    } else {
      const distBaseToIntermediate = currentJob.distanceFromBase;
      // API call uses city name directly from sheet
      const distIntermediateToFurthest = getMapsDistance(currentJob.city, furthestJob.city); 
      
      if (furthestJob.distanceFromBase === 0 || furthestJob.distanceFromBase >= 999999990) { // Avoid division by zero or if furthest city distance is an error sentinel
          Logger.log(`ERROR in processDailyJobs: Distance to furthest city (${furthestJob.city}) is zero or error. Calculating full value for ${currentJob.city}.`);
          finalValue = calculateFullServiceValue(currentJob.city, currentJob.notes);
      } else {
        const detourPercentage = ((distBaseToIntermediate + distIntermediateToFurthest) / furthestJob.distanceFromBase) - 1;
        Logger.log(`INFO in processDailyJobs: Analyzing ${currentJob.city} - Detour: ${(detourPercentage * 100).toFixed(2)}%`);
        
        if (detourPercentage < 0.25 && detourPercentage >= -0.05) { // Detour less than 25% (allowing small negative for API variance)
          finalValue = minimumValue;
        } else {
          finalValue = calculateFullServiceValue(currentJob.city, currentJob.notes);
        }
      }
    }
    sheet.getRange(currentJob.row, COL.VALUE).setValue(finalValue);
  }
  Logger.log("--- processDailyJobs COMPLETED ---");
}

/**
 * Fetches driving distance in meters between two locations using Google Maps Routes API.
 * Caches results for 6 hours.
 * @param {string} origin The starting point (e.g., "Toronto, ON, Canada" or "Mississauga, ON").
 * @param {string} destination The ending point (e.g., "Hamilton, ON" or "Brampton").
 * @return {number} Distance in meters, or a large number if an error occurs.
 */
function getMapsDistance(origin, destination) {
  if (!origin || !destination) {
    Logger.log(`ERROR in getMapsDistance: Origin or destination is empty. Origin: '${origin}', Destination: '${destination}'`);
    return 999999999; // Error sentinel
  }
  const cache = CacheService.getScriptCache();
  const cacheKey = `dist_${origin}_${destination}`.replace(/[^a-zA-Z0-9_.-]/g, '_'); // Sanitize cache key
  const cachedDistance = cache.get(cacheKey);
  if (cachedDistance) {
    Logger.log(`INFO in getMapsDistance: Distance for '${origin}' -> '${destination}' from cache: ${cachedDistance}m`);
    return Number(cachedDistance);
  }

  Logger.log(`INFO in getMapsDistance: CALLING API: Origin='${origin}', Destination='${destination}'`);
  const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
  const payload = { 
    origin: { address: origin }, 
    destination: { address: destination }, 
    travelMode: "DRIVE" 
  };
  const params = {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      "X-Goog-Api-Key": API_KEY, 
      "X-Goog-FieldMask": "routes.distanceMeters" 
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true 
  };

  try {
    const response = UrlFetchApp.fetch(url, params);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText(); 
    Logger.log(`INFO in getMapsDistance: API responded for '${origin}'->'${destination}' with code ${responseCode}. Response (first 500 chars): ${responseText.substring(0, 500)}...`);

    if (responseCode === 200) {
      const data = JSON.parse(responseText);
      if (data.routes && data.routes.length > 0 && data.routes[0].distanceMeters !== undefined) {
        const distanceMeters = data.routes[0].distanceMeters;
        cache.put(cacheKey, distanceMeters.toString(), 21600); 
        Logger.log(`INFO in getMapsDistance: Success! Distance: ${distanceMeters}m`);
        return distanceMeters;
      } else {
        Logger.log(`ERROR in getMapsDistance: API returned 200 but no valid route for '${origin}' -> '${destination}'. Response: ${responseText}`);
        return 999999999; 
      }
    } else {
      Logger.log(`ERROR in getMapsDistance: API response code was not 200 for '${origin}' -> '${destination}'. Code: ${responseCode}. Response: ${responseText}`);
      return 999999999; 
    }
  } catch (e) {
    Logger.log(`CRITICAL ERROR in getMapsDistance calling API for '${origin}' -> '${destination}': ${e.toString()}. Stack: ${e.stack}`);
    return 999999999;
  }
}

/**
 * Calculates the full service value based on distance from an internal table and SVD status.
 * @param {string} city The city name. Must match a key in the DISTANCES object.
 * @param {string} notes The content of the notes/observation column (for SVD).
 * @return {number|string} The calculated value or an error message.
 */
function calculateFullServiceValue(city, notes) {
  // IMPORTANT: Customize this internal distance table for your needs.
  // These are example distances in KILOMETERS from the BASE_CITY for fixed price calculations.
  // The keys should be how city names are typically entered in your CITY column.
  const DISTANCES = { 
    "TORONTO": 1,        // Or 0 if it's the base
    "MISSISSAUGA": 30,
    "BRAMPTON": 45,
    "HAMILTON": 70,
    "OSHAWA": 60,
    "SCARBOROUGH": 20,
    "MARKHAM": 35
    // Add more of your common service cities and their reference distances here
  };
  
  // Example pricing tiers. Customize these values as needed.
  const calculateStandardValue = (km) => { 
    // Using the same numerical values as the original for example structure
    if (km <= 50) return 140; if (km <= 100) return 260; if (km <= 150) return 270; 
    if (km <= 200) return 364; if (km <= 250) return 374; if (km <= 300) return 384; 
    if (km <= 350) return 540; if (km <= 400) return 550; 
    return "Outside rate table"; 
  };
  const calculateSvdValue = (km) => { 
    if (km <= 50) return 290; if (km <= 100) return 384; if (km <= 150) return 395; 
    if (km <= 200) return 560; if (km <= 250) return 572; if (km <= 300) return 580; 
    if (km <= 350) return 590; if (km <= 400) return 600; 
    return "Outside rate table"; 
  };

  const isSVD = notes.toString().toUpperCase().trim() === SVD_KEYWORD;
  const cityKey = city.toString().toUpperCase().trim(); // Use normalized city name for lookup
  const distanceKm = DISTANCES[cityKey];

  if (distanceKm === undefined) {
    Logger.log(`ERROR in calculateFullServiceValue: City "${cityKey}" not found in internal DISTANCES table.`);
    return "City not in fixed rate table"; // Or handle differently, e.g., by always calling API
  }

  return isSVD ? calculateSvdValue(distanceKm) : calculateStandardValue(distanceKm);
}