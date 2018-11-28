module.exports = {
  scalar,
  repeat,
  isNullDate,
  isValidDate,
  deepClone,
  matchAll,
};

/**
 * Only let scalar values through.
 *
 * If passed an object or array returns undefined
 * @param {any} data
 * @return {number|string|boolean|Date}
 */
function scalar (data) {
  if (data === null || typeof data === "undefined") {
      return null;
  }
  if (data.toString() === "[object Object]") {
      return; // undefined
  }
  if (Array.isArray(data)) {
      return; // undefined
  }
  return data;
}

/**
*
* @param {string} char
* @param {number} n
*/
function repeat (char, n) {
  return Array(n + 1).join(char);
}

/**
* Returns true iff param is Date object AND is invalid
* @param {any} date
* @returns {boolean}
*/
function isNullDate (date) {
  return date instanceof Date && isNaN(+date);
}

/**
* Returns true iff param is Date object AND is valid
* @param {any} date
* @returns {boolean}
*/
function isValidDate (date) {
  return date instanceof Date && !isNaN(+date);
}

/**
* Clone an object semi-deeply.
*
* All the objects on the specified path need to be deep cloned.
* Everything else can be shallow cloned.
*
* @param {any} result
* @param {string} path
* @returns {any}
*/
function deepClone (result, path) {
  // Top level clone only
  if (path.length === 0) return { ...result };

  // Could be deeper... more accurate
  // At the moment it actually only clones one level deep
  const pathParts = path.split(".");
  return { ...result, [pathParts[0]]: { ...result[pathParts[0]] } };
}

/**
 * @param {string} string
 * @param {RegExp} regex
 * @returns {RegExpExecArray[]}
 */
function matchAll(string, regex) {
	/** @type {RegExpExecArray[]} */
	const out = [];

	let match;

	do {
		match = regex.exec(string);

		if (match) {
			out.push(match);
		}
	} while (match || !regex.global);

	return out;
}