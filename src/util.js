module.exports = {
  scalar,
  formatScalar,
  getColumnTypes,
  repeat,
  isNullDate,
  isValidDate,
  deepClone,
  matchAll,
  matchInBrackets,
  queryResultToObjectArray,
  toUTF8Array,
  fromUTF8Array,
  split,
  zip,
  chunks,
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
 * Convert scalar values for presentation
 *
 * If passed an object returns string representation
 * If passed an array returns scalar elements joined together
 * @param {any} data
 * @return {number|string|boolean|Date}
 */
function formatScalar (data) {
  if (data === null || typeof data === "undefined") {
      return null;
  }
  if (data.toString() === "[object Object]") {
      return `<Object {${Object.keys(data)}}>`;
  }
  if (Array.isArray(data)) {
      return `<List [${data.map(formatScalar).join()}]>`;
  }
  return data;
}

function getColumnTypes (row) {

    if (row) {
        return Object
            .entries(row)
            .filter(([name, value]) => typeof scalar(value) !== "undefined")
            .map(([name, value]) => ({ name, type: value instanceof Date ? "date" : typeof value }));
    }

    return [];
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
  // if this has already passed through `moment.format` it might appear as 'Invalid Date'
  return date === "Invalid date" || date instanceof Date && isNaN(+date);
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

/**
 *
 * @param {string} input
 * @returns {string}
 */
function matchInBrackets (input) {
  const brackets = matchAll(input, /[\(\)]/g);

  if (brackets.length === 0) {
    return null;
  }

  let depth = 0;
  for (const bracket of brackets) {
    if (bracket[0] === "(") {
      depth++;
    } else {
      depth--;
    }

    if (depth === 0) {
      return input.substring(brackets[0].index + 1, bracket.index);
    }
  }

  throw Error("Unmatched bracket");
}

/**
*
* @param {any[][]} result
* @returns {any[]}
*/
function queryResultToObjectArray (result, newHeaders = null) {
  const originalHeaders = result.shift();

  return result.map(r => zip(newHeaders || originalHeaders, r));
}

/**
*
* @param {string[]} keys
* @param {any[]} values
* @returns {{ [key: string]: any }}
*/
function zip (keys, values) {
  const out = {};
  for (let i = 0; i < Math.max(keys.length, values.length); i++) {
      out[keys[i] || i] = values[i];
  }
  return out;
}

/**
 *
 * @param {string} str
 * @returns {number[]}
 * @see https://stackoverflow.com/a/18729931
 */
function toUTF8Array (str) {
  /** @type {number[]} */
  var utf8 = [];
  for (var i=0; i < str.length; i++) {
      var charcode = str.charCodeAt(i);
      if (charcode < 0x80) utf8.push(charcode);
      else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
                    0x80 | (charcode & 0x3f));
      }
      else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
                    0x80 | ((charcode>>6) & 0x3f),
                    0x80 | (charcode & 0x3f));
      }
      // surrogate pair
      else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
                    | (str.charCodeAt(i) & 0x3ff))
          utf8.push(0xf0 | (charcode >>18),
                    0x80 | ((charcode>>12) & 0x3f),
                    0x80 | ((charcode>>6) & 0x3f),
                    0x80 | (charcode & 0x3f));
      }
  }
  return utf8;
}

/**
 *
 * @param {number[]} data
 * @returns {string}
 * @see https://weblog.rogueamoeba.com/2017/02/27/javascript-correctly-converting-a-byte-array-to-a-utf-8-string/
 */
function fromUTF8Array (data)
{
  const extraByteMap = [ 1, 1, 1, 1, 2, 2, 3, 0 ];
  var count = data.length;
  var str = "";
  
  for (var index = 0;index < count;)
  {
    var ch = data[index++];
    if (ch & 0x80)
    {
      var extra = extraByteMap[(ch >> 3) & 0x07];
      if (!(ch & 0x40) || !extra || ((index + extra) > count))
        return null;
      
      ch = ch & (0x3F >> extra);
      for (;extra > 0;extra -= 1)
      {
        var chx = data[index++];
        if ((chx & 0xC0) != 0x80)
          return null;
        
        ch = (ch << 6) | (chx & 0x3F);
      }
    }
    
    // Bug in original code
    str += String.fromCodePoint(ch);
  }
  
  return str;
}

/**
 *
 * @param {string} input
 * @param {string} splitter
 * @param {number} limit
 */
function split (input, splitter, limit) {
    const index = input.indexOf(splitter);

    if (index === -1) {
        return [input];
    }

    if (limit > 2) {
        throw Error("Split above 2 not implemented.");
    }

    return [ input.substr(0, index), input.substr(index + 1) ];
}

/**
 * 
 * @param {string} input 
 * @param {number} size 
 * @returns {string[]}
 */
function chunks (input, size) {
  if ((input.length / size) % 1) throw Error("Input length is not a multiple of size");

  return Array.from(input.matchAll(new RegExp(`.{${size}}`, "g"))).map(m => m[0]);
}