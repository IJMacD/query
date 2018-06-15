const moment = require('moment');
const columnify = require('columnify');
const { repeat } = require('./util');

module.exports = {
  format
};

function format (data, mime = "text/plain") {
  switch (mime) {
    case "application/json":
      return JSON.stringify(data);
    case "text/csv":
      return data.map(row => row.map(d => csvSafe(formatVal(d))).join(",")).join("\n");
    case "text/plain":
    default: {
      const rows = data.map(row => row.map(formatPlainTextVal));
      const headers = rows.shift();
      const lines = headers.map(c => repeat("-", c.length));

      rows.unshift(lines);
      rows.unshift(headers);

      const options = {
          showHeaders: false,
      };

      return columnify(rows, options);
    }
  }
}

function formatPlainTextVal (data) {
    if (data === null || typeof data === "undefined") {
        return "NULL";
    }

    if (data instanceof Date) {
        return moment(data).format("ddd DD/MM HH:mm");
    }

    return String(data);
}


/**
 *
 * @param {any} data
 * @returns {string}
 */
function formatVal (data) {
  if (data instanceof Date) {
      return isNaN(+data) ? "" : data.toISOString();
  }

  return data === null ? "" : String(data);
}

/**
* Does CSV quoting
*
* i.e. hello         => hello
*      hello, world  => "hello, world"
*      hello, "Iain" => "hello, ""Iain"""
* @param {string} input
*/
function csvSafe (input) {
  return input.includes(",") ? `"${input.replace('"', '""')}"` : input;
}