module.exports = {
  COMPOUND_OPERATORS: {
    INTERSECT: intersectResults,
    EXCEPT: exceptResults,
    UNION: unionResults,
    "UNION ALL": unionAllResults,
  },
  distinctResults,
};

/** @typedef {import('..').ResultRow} ResultRow */

/**
 * @param {ResultRow[][]} resultsL
 * @param {ResultRow[][]} resultsR
 * @returns {ResultRow[][]}
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
 * @param {ResultRow[][]} resultsL
 * @param {ResultRow[][]} resultsR
 * @returns {ResultRow[][]}
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
 * @param {ResultRow[][]} resultsL
 * @param {ResultRow[][]} resultsR
 * @returns {ResultRow[][]}
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
 * @param {ResultRow[][]} resultsL
 * @param {ResultRow[][]} resultsR
 * @returns {ResultRow[][]}
 */
function unionAllResults (resultsL, resultsR) {
  return [ ...resultsL, ...resultsR.slice(1) ];
}

/**
 * @param {ResultRow[][]} results
 * @returns {ResultRow[][]}
 */
function distinctResults (results) {
  return Array.from(distinctMap(results).values());
}

/**
 * We're doing super cheap distinct mapping. It only looks at the first
 * column! This really only works if the data has an ID or similar in
 * the first column of restults.
 * The implementation keeps the first row it finds for each first-column-value.
 * @param {ResultRow[][]} results
 * @returns {Map<ResultRow, ResultRow[]> }}
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