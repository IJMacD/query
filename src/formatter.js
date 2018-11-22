const moment = require('moment');
const columnify = require('columnify');
const { repeat } = require('./util');

module.exports = {
  format
};

function format (data, { mime = "text/plain", locale = undefined, name = undefined } = {}) {
  switch (mime) {
    case "application/json":
      return JSON.stringify(data);
    case "text/csv":
      return data.map(row => row.map(d => csvSafe(formatVal(d))).join(",")).join("\n");
    case "text/html":
      return `${renderStyle()}${renderTable({ rows: data, locale })}`;
    case "application/sql":
      return renderSQLInsert(data, { tableName: name });
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
 * @param {any[][]} data
 */
function renderSQLInsert (data, { tableName = "data" } = {}) {
  const headers = data.shift();
  const headerList = headers.map(h => `"${h}"`).join(", ");
  const create = `CREATE TABLE IF NOT EXISTS ${tableName} (${headerList})`;
  const insert = `INSERT INTO ${tableName} (${headerList}) VALUES\n${data.map(row => `('${row.join("', '")}')`).join(",\n")}`;
  return `${create};\n${insert};\n`
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

function renderStyle () {
  return `<style>
    table {
      font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif;
      border-collapse: collapse;
      margin: -1px;
    }
    th {
        background-image: linear-gradient(to bottom, #FFF, #CCC)
    }
    td,
    th {
        border: 1px solid #CCC;
        padding: 3px;
    }
    tfoot td {
        font-weight: bold;
    }
    </style>`;
}

function renderTable({ rows, locale }) {
  const headerRow = rows.shift();

  return `<table>
          <thead>
              <tr>${headerRow.map(cell => `<th>${cell}</th>`).join("")}</tr>
          </thead>
          <tbody>
              ${rows.map(row => `
                  <tr>${row.map(cell => `<td>${formatHTML({ cell, locale })}</td>`).join("")}</tr>
              `).join("")}
          </tbody>
          <tfoot><tr><td colspan="${headerRow.length}">${rows.length} rows</td></tr></tfoot>
      </table>`;
}

function formatHTML ({ cell, locale }) {
  if (cell === null) {
    return "";
  }

  // Special Formatting for colour
  if (/^#[0-9a-f]{6}$/i.test(cell)) {
    return `<div style="background-color: ${cell}; height: 20px; width: 20px; margin: 0 auto;" title="${cell}"></div>`;
  }

  // Special formatting for date
  if (cell instanceof Date) {
    if (cell.getHours() === 0 && cell.getMinutes() === 0) {
      return cell.toLocaleDateString(locale);
    }
    return cell.toLocaleString(locale);
  }

  cell = String(cell);

  // Special formatting for urls and images
  cell = cell.replace(/https?:\/\/[^,]+/g, url => {
    let content = url;
    if (/\.(jpe?g|gif|png|webp)$/i.test(url)) {
      content = `<object data="${url}" height="64"></object>`;
    }
    return `<a href="${url}" target="_blank">${content}</a>`;
  });

  // Special formatting for email addresses
  cell = cell.replace(/[^@,\s]+@[^@,\s]+\.[^@,\s]+/g, email => `<a href="mailto:${email}">${email}</a>`);

  return cell;
}