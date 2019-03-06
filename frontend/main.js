/** @type {HTMLInputElement} */
const input =  /* @type {HTMLInputElement} */ (document.getElementById("input"));
const output = document.getElementById("output");
const queryForm = document.getElementById("query-form");
const querySuggest = document.getElementById("query-suggest");

const QUERY_HISTORY = "query_history";
const HISTORY_SHOW_COUNT = 20;
const HISTORY_SAVE_COUNT = 100;
let queryHistory = loadHistory();

/**
 * Use <object> instead of <img>
 */
const OBJECT_IMAGE = false;

const HTML_ESCAPING = true;

handleHash();
input.focus();
populateExplorer();

queryForm.addEventListener("submit", e => {
    e.preventDefault();
    sendQuery();
});

document.addEventListener("keydown", e => {
    if (e.key === "Enter") sendQuery();
    else if (e.key === "Escape") hideSuggestions();
    else if (e.key === "Tab") {
        const suggestions = getSuggestions();
        if (suggestions.length >= 1) {
            e.preventDefault();
            input.value = suggestions[0];
        }
    }
});

document.addEventListener("click", e => {
    hideSuggestions();
});

input.addEventListener("keyup", e => {
    if (e.altKey && "1234567890".includes(e.key)) {
        e.preventDefault();
        const suggest = getSuggestions()["1234567890".indexOf(e.key)];
        if (typeof suggest !== "undefined") {
            input.value = suggest;
        }
    }
    else if (e.key === "Escape") return;
    showSuggestions();
});

querySuggest.addEventListener("click", e => {
    if (e.target instanceof HTMLLIElement) {
        input.value = e.target.textContent;
        showSuggestions();
        input.focus();
    }
});

window.addEventListener("hashchange", handleHash);

function handleHash () {
    if (location.hash && !input.disabled) {
        const searchParams = new URLSearchParams(location.hash.substr(1));
        if (searchParams.has("q")) {
            input.value = searchParams.get("q");
            sendQuery();
        }
    }
}

function populateExplorer () {
    const explorer = document.getElementById('explorer');
    explorer.addEventListener("click", e => {
        if (e.target instanceof HTMLLIElement) {
            let { value, selectionStart, selectionEnd } = input;
            const { insert, insertBefore = "", insertAfter = "" } = e.target.dataset;

            const before = value.substring(0,selectionStart);
            const inside = value.substring(selectionStart, selectionEnd);
            const after = value.substring(selectionEnd);

            const newInside = insert || inside;
            input.value = before + insertBefore + newInside + insertAfter + after;

            selectionStart += insertBefore.length
            if (inside === "") {
                selectionStart += newInside.length;
                selectionEnd = selectionStart;
            } else {
                selectionEnd = selectionStart + newInside.length;
            }

            input.setSelectionRange(selectionStart, selectionEnd);
            input.focus();
        }
    });

    query(`FROM information_schema.tables
        SELECT table_schema, table_name, table_type
        UNION ALL
        FROM information_schema.routines
        WHERE data_type = 'table'
        SELECT null, routine_name, 'table function'`)
    .then(r => {
        // headers
        r.shift();

        const out = r.map(t => {
            if (t[2] === "table function") {
                const className = "table-function";
                const insertBefore = `${t[1]}(`;
                const insertAfter = ")";
                return `<li class="${className}" data-insert-before="${insertBefore}" data-insert-after="${insertAfter}">${t[0] ? (t[0] + ".") : ""}${t[1]}</li>`;
            }
            const className = t[2].includes("VIEW") ? "view" : "table";
            const insert = t[0] === "information_schema" ? `${t[0]}.${t[1]}` : t[1];
            return `<li class="${className}" data-insert="${insert}">${t[0] ? (t[0] + ".") : ""}${t[1]}</li>`;
        }).join("");

        document.getElementById("explorer-table-list").innerHTML = out;
    });

    query("FROM information_schema.routines WHERE data_type != 'table'").then(/** @param {any[][]} r */ r => {
        /** @type {string[]} */
        const headers = r.shift();
        const nameCol = headers.indexOf("routine_name");

        const out = r.map(t => {
            return `<li class="function" data-insert-before="${t[nameCol]}(" data-insert-after=")">${t[nameCol]}</li>`;
        }).join("");

        document.getElementById("explorer-function-list").innerHTML = out;
    });
}

function sendQuery () {
    hideSuggestions();
    output.innerHTML = "";
    input.disabled = true;
    const start = Date.now();
    location.hash = "#q=" + encodeURIComponent(input.value);
    document.title = "Query: " + input.value;
    query(input.value)
        .then(data => {
            const duration = (Date.now() - start) / 1000;
            saveHistory(input.value);

            if (data.length === 2 && data[0][0] === "AST") {
                output.innerHTML = renderAST(data[1][0]);
                return;
            }

            output.innerHTML = renderTable({ rows: data.slice(), duration });

            if (data.length >= 3 && data[0].length >= 2 &&
                typeof data[1][0] === "number" && typeof data[1][1] === "number")
            {
                const footer = output.querySelector("tfoot td");
                if (footer) {
                    const btn = document.createElement("button");
                    btn.className = "link";
                    btn.innerHTML = "Graph";
                    btn.addEventListener("click", () => {
                    footer.removeChild(btn);
                        output.appendChild(renderGraph(data.slice()));
                    });
                    footer.appendChild(btn);
                }
            }
        })
        .catch(e => {
            output.innerHTML = `<p style="color: red; margin: 20px;">${e}</p>`;
        })
        .then(() => {
            input.disabled = false;
        });
}

/**
 * @param {{ rows: any[][], duration: number }} options
 */
function renderTable({ rows, duration }) {
    const headerRow = rows.shift();

    if (!headerRow) {
        return `<p style="font-weight: bold;">Empty Result Set</p><p>${duration} seconds</p>`;
    }

    return `<table>
            <thead>
                <tr>${headerRow.map(cell => `<th>${cell}</th>`).join("")}</tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>${row.map(cell => `<td>${formatCell({ cell })}</td>`).join("")}</tr>
                `).join("")}
            </tbody>
            <tfoot><tr><td colspan="${headerRow.length}">${rows.length} rows, ${duration} seconds</td></tr></tfoot>
        </table>`;
}

function formatCell ({ cell }) {
    if (cell === null) {
        return `<span class="null"></span>`;
    }

    if (cell instanceof Date) {
        return formatDate(cell);
    }

    let str = String(cell);

    if (HTML_ESCAPING && str.includes("<")) {
        str = escapeHtml(str);
    }

    // Special Formatting for colour
    if (/^#[0-9a-f]{6}$/i.test(str)) {
        return `<div style="background-color: ${str}; height: 20px; width: 20px; margin: 0 auto;" title="${str}"></div>`;
    }

    // Special formatting for date
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const d = new Date(str);
        return formatDate(d);
    }

    if (!str.includes("<")) {
        // Special formatting for urls and images
        str = str.replace(/https?:\/\/[^,'>" &()[\]]+/g, url => {
            let content = url;
            if (/\.(jpe?g|gif|png|webp)$/i.test(url)) {
                content = OBJECT_IMAGE ? `<object data="${url}" height="64"></object>` : `<img src="${url}" height="64" />`;
            }
            return `<a href="${url}" target="_blank">${content}</a>`;
        });

        // Special formatting for email addresses
        str = str.replace(/[^@,\s]+@[^@,\s]+\.[^@,\s]+/g, email => `<a href="mailto:${email}">${email}</a>`);
    }

    return str;
}

function formatDate (d) {
    if (d.getHours() === 0 && d.getMinutes() === 0) {
        return d.toLocaleDateString(navigator.language);
    }
    return d.toLocaleString(navigator.language);
}

/**
 *
 * @param {any[][]} data
 */
function renderGraph (data) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 300;
    canvas.height = 300;

    const headers = data.shift();

    const X = data.map(r => r[0]);
    const Y = data.map(r => r[1]);

    const minX = Math.min(...X);
    const maxX = Math.max(...X);
    const minY = Math.min(...Y);
    const maxY = Math.max(...Y);

    const xScale = canvas.width / (maxX - minX);
    const yScale = canvas.height / (maxY - minY);

    const h = canvas.height;

    ctx.strokeStyle = "#999";
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.moveTo((X[0] - minX) * xScale, h - (Y[0] - minY) * yScale);

    for (let i = 1; i < data.length; i++) {
        ctx.lineTo((X[i] - minX) * xScale, h - (Y[i] - minY) * yScale);
    }

    ctx.strokeStyle = "red";
    ctx.stroke();

    return canvas;
}

function renderAST (json) {
    const ast = JSON.parse(json);

    return renderNode(ast);
}

/**
 * @enum {number}
 */
const NODE_TYPES = {
    UNKNOWN: 0,
    STATEMENT: 1,
    CLAUSE: 2,
    FUNCTION_CALL: 3,
    SYMBOL: 4,
    STRING: 5,
    NUMBER: 6,
    OPERATOR: 7,
    LIST: 8,
};
const DEBUG_NODE_TYPES = [
    "UNKNOWN",
    "STATEMENT",
    "CLAUSE",
    "FUNCTION_CALL",
    "SYMBOL",
    "STRING",
    "NUMBER",
    "OPERATOR",
    "LIST",
];

function renderNode (node) {
    const type = DEBUG_NODE_TYPES[node.type].toLowerCase().replace(/[ _]/g, "-");
    const name = String(node.id !== null ? node.id : (node.type === NODE_TYPES.LIST ? "LIST" : ''));
    const id = name.toLowerCase().replace(/[ _]/g, "-");
    return `<div class="node-type-${type} node-id-${id}" title="${node.source.replace(/"/g, '&quot;')}">
        <span class="node-id">${name}</span>
        ${Array.isArray(node.children) ? `<ul>${node.children.map(c => `<li>${c.alias?`<span class="node-alias">${c.alias}</span>`:''}${renderNode(c)}</li>`).join('')}</ul>` : ''}
    </div>`;
}

function getSuggestions () {
    return queryHistory.filter(q => q && q != input.value && q.startsWith(input.value)).slice(0, HISTORY_SHOW_COUNT);
}

function showSuggestions () {
    querySuggest.innerHTML = getSuggestions().map(m => `<li>${m}</li>`).join("");
}

function hideSuggestions () {
    querySuggest.innerHTML = "";
}

function saveHistory (value) {
    queryHistory = queryHistory.filter(q => q !== value);
    queryHistory.unshift(input.value);
    queryHistory.length = HISTORY_SAVE_COUNT;
    localStorage.setItem(QUERY_HISTORY, JSON.stringify(queryHistory));
}

function loadHistory () {
    const saved = localStorage.getItem(QUERY_HISTORY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) { }
    }
    return [];
}

function escapeHtml(text) {
    var map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };

    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}