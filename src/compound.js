/**
 * @param {any[][]} resultsL
 * @param {any[][]} resultsR
 * @returns {any[][]}
 */
function intersectResults (resultsL, resultsR) {
  const headerRow = resultsL[0];

  const dL = distinctMap(resultsL.slice(1));
  const dR = distinctMap(resultsR.slice(1));

  const out = [headerRow];

  for (const [key, row] of dL) {
    if (dR.has(key)) {
      out.push(row);
    }
  }

  return out;
}

/**
 * @param {any[][]} resultsL
 * @param {any[][]} resultsR
 * @returns {any[][]}
 */
function exceptResults (resultsL, resultsR) {
  const headerRow = resultsL[0];

  const dL = distinctMap(resultsL.slice(1));
  const dR = distinctMap(resultsR.slice(1));

  const out = [headerRow];

  for (const [key, row] of dL) {
    if (!dR.has(key)) {
      out.push(row);
    }
  }

  return out;
}

/**
 * @param {any[][]} resultsL
 * @param {any[][]} resultsR
 * @returns {any[][]}
 */
function unionResults (resultsL, resultsR) {
  const headerRow = resultsL[0];

  const dL = distinctMap(resultsL.slice(1));
  const dR = distinctMap(resultsR.slice(1));

  for (const [key, row] of dR) {
    if (!dL.has(key)) {
      dL.set(key, row);
    }
  }

  return [headerRow, ...dL.values()];
}

/**
 * @param {any[][]} resultsL
 * @param {any[][]} resultsR
 * @returns {any[][]}
 */
function unionAllResults (resultsL, resultsR) {
  return [ ...resultsL, ...resultsR.slice(1) ];
}

/**
 * @param {any[][]} results
 * @returns {any[][]}
 */
function distinctResults (results) {
  return Array.from(distinctMap(results).values());
}

/**
 * We're doing super cheap distinct mapping. It only looks at the first
 * column! This really only works if the data has an ID or similar in
 * the first column of restults.
 * The implementation keeps the first row it finds for each first-column-value.
 * @param {any[][]} results
 * @returns {Map<any, any[]> }}
 */
function distinctMap (results) {
  const outMap = new Map();
  for (const row of results) {
    if (!outMap.has(row[0])) {
      outMap.set(row[0], row);
    }
  }
  return outMap;
}

module.exports = {
  intersectResults,
  exceptResults,
  unionResults,
  unionAllResults,
  distinctResults,
};