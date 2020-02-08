const input =  /** @type {HTMLInputElement} */ (document.getElementById("input"));
const paramsDiv = document.getElementById("params");
const output = document.getElementById("output");
const queryForm = document.getElementById("query-form");
const querySuggest = document.getElementById("query-suggest");
const explorer = document.getElementById("explorer");
const explorerToggle = document.getElementById("explorer-toggle");
const expandedToggle = document.getElementById("expanded-input-toggle");
const expandedInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("input-expanded"));

const QUERY_HISTORY = "query_history";
const HISTORY_SHOW_COUNT = 20;
const HISTORY_SAVE_COUNT = 100;
let queryHistory = loadHistory();
const FLOATING_EXPLORER = false;

// Needs to be duplicated here because in server mode
// this file is not built and is sent as-is
// i.e. require() does not exist in browser
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
    COMPOUND_QUERY: 9,
    CONSTANT: 10,
    PARAM: 11,
};

let isInputExpanded = false;
let params = {};

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
    if (e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Tab") {
            e.preventDefault();
            var start = e.target.selectionStart;
            var end = e.target.selectionEnd;
            var text = e.target.value
            var selText = text.substring(start, end);
            e.target.value =
                text.substring(0, start) +
                "\t" + selText.replace(/\n/g, "\n\t") +
                text.substring(end)
            ;
            e.target.selectionStart = e.target.selectionEnd = start + 1;
        }
        return;
    }

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

if (FLOATING_EXPLORER) {
    document.addEventListener("click", e => {
        hideSuggestions();
        if (e.target instanceof HTMLElement && !explorer.contains(e.target)) {
            explorer.style.display = "none";
        }
    });
}

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

explorer.style.display = "none";
const fn =  e => {
    explorer.style.display = explorer.style.display === "none" ? "block" : "none";
    e.stopPropagation();
};
explorerToggle.addEventListener("click", fn);
explorerToggle.addEventListener("touchstart", fn);

expandedToggle.addEventListener('click', e => {
    isInputExpanded = !isInputExpanded;
    input.style.display = isInputExpanded ? "none" : "";
    expandedInput.style.display = isInputExpanded ? "" : "none";
    if (isInputExpanded) {
        expandedInput.value = input.value;
    } else {
        input.value = expandedInput.value;
    }
});

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
    explorer.innerHTML = "";

    explorer.className = FLOATING_EXPLORER ? "float" : "";

    const refreshButton = document.createElement("button");
    refreshButton.innerText = "Refresh";
    refreshButton.addEventListener("click", populateExplorer);
    explorer.appendChild(refreshButton);

    const browseLabel = document.createElement("label");
    const browseInput = document.createElement("input");
    browseInput.checked = true;
    browseInput.type = "radio";
    browseInput.name = "browse_or_insert";
    browseLabel.appendChild(browseInput);
    browseLabel.appendChild(document.createTextNode("Browse"));

    const insertLabel = document.createElement("label");
    const insertInput = document.createElement("input");
    insertInput.type = "radio";
    insertInput.name = "browse_or_insert";
    insertLabel.appendChild(insertInput);
    insertLabel.appendChild(document.createTextNode("Insert"));

    // Just assign to onclick to avoid double events after "Refresh"
    explorer.onclick = e => {
        let target = e.target;

        if (target instanceof HTMLSpanElement) {
            target = target.parentElement;
        }

        if (target instanceof HTMLLIElement) {
            let { value, selectionStart, selectionEnd } = input;
            const { dataset, classList } = target;
            const { insert, insertBefore = "", insertAfter = "" } = dataset;

            if (classList.contains("treeview")) {
                classList.toggle("collapsed");
                return;
            }

            if (browseInput.checked && insert) {
                input.value = `FROM ${insert}`;
                sendQuery();
                return;
            }

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
    };

    const tablesHeader = document.createElement("h2");
    tablesHeader.innerText = "Tables";
    explorer.appendChild(tablesHeader);
    explorer.appendChild(browseLabel);
    explorer.appendChild(insertLabel);

    const tablesList = document.createElement("ul");
    explorer.appendChild(tablesList);

    query(`FROM information_schema.tables
        SELECT table_schema, table_name, table_type
        UNION ALL
        FROM information_schema.routines
        WHERE data_type = 'table'
        SELECT routine_schema, routine_name, 'table function'`)
    .then(r => {
        // headers
        r.shift();
        let prevSchema = null;

        const out = r.map(t => {
            let out = "";
            const schema = t[0] || "No Schema";

            if (schema !== prevSchema) {
                if (prevSchema !== null) {
                    out += "</ul></li>"
                }

                out += `<li class="schema treeview collapsed"><span>${schema}</span><ul>`;
            }

            if (t[2] === "table function") {
                const className = "table-function";
                const insertBefore = `${t[1]}(`;
                const insertAfter = ")";
                out += `<li class="${className}" data-insert-before="${insertBefore}" data-insert-after="${insertAfter}" title="TABLE VALUED FUNCTION">${t[1]}</li>`;
            }
            else {
                const className = t[2].includes("VIEW") ? "view" : "table";
                const insert = `${t[0] ? (t[0] + ".") : ""}${t[1]}`;
                out += `<li class="${className}" data-insert="${insert}" title="${t[2]}">${t[1]}</li>`;
            }

            prevSchema = schema;

            return out;
        }).join("");

        tablesList.innerHTML = out;
    });

    const routinesHeader = document.createElement("h2");
    routinesHeader.innerText = "Functions";
    explorer.appendChild(routinesHeader);

    const routinesList = document.createElement("ul");
    explorer.appendChild(routinesList);

    query("FROM information_schema.routines WHERE data_type != 'table'").then(/** @param {any[][]} r */ r => {
        /** @type {string[]} */
        const headers = r.shift();
        const nameCol = headers.indexOf("routine_name");
        const typeCol = headers.indexOf("routine_type");

        const out = r.map(t => {
            const className = t[typeCol] === "AGGREGATE FUNCTION" || t[typeCol] === "WINDOW FUNCTION" ? "aggregate-function" : "function";
            return `<li class="${className}" data-insert-before="${t[nameCol]}(" data-insert-after=")" title="${t[typeCol]}">${t[nameCol]}</li>`;
        }).join("");

        routinesList.innerHTML = out;
    });

    const keywordsHeader = document.createElement("h2");
    keywordsHeader.innerText = "Keywords";
    explorer.appendChild(keywordsHeader);

    const keywordsList = document.createElement("ul");
    explorer.appendChild(keywordsList);

    const keywords = ["SELECT","FROM","WHERE","GROUP BY","ORDER BY","OVER","WITH"];

    const out = keywords.map(t => {
        return `<li class="" data-insert-before="${t} ">${t}</li>`;
    }).join("");

    keywordsList.innerHTML = out;
}

function sendQuery () {
    hideSuggestions();
    if (!isInputExpanded) {
       expandedInput.value = input.value;
    }
    const { value } = expandedInput;
    output.innerHTML = "";
    input.disabled = true;
    expandedInput.disabled = true;
    const start = Date.now();
    location.hash = "#q=" + encodeURIComponent(value);
    document.title = "Query: " + value;
    let promise;
    if (query.prepare) {
        paramsDiv.innerHTML = "";
        try {
            const stmt = query.prepare(value);
            for (const p of stmt.namedParams) {
                if (typeof params[p] === "undefined") params[p] = "";
                const el = document.createElement("input");
                el.value = params[p];
                el.title = p;
                el.placeholder = p;
                el.onchange = () => params[p] = isNaN(+el.value) ? el.value : +el.value;
                paramsDiv.appendChild(el);
            }
            promise = stmt.execute(params);
        } catch (e) {
            promise = query(value);
        }
    } else {
        promise = query(value);
    }
    promise.then(data => {
        const duration = (Date.now() - start) / 1000;
        saveHistory(value);

        console.log(data);

        if (data.length === 2 && data[0][0] === "AST") {
            output.innerHTML = renderAST(data[1][0]);
            return;
        }

        output.innerHTML = renderTable({ rows: data.slice(), duration });

        if (data.length >= 3 && data[0].length >= 2 &&
            typeof data[1][0] === "number" && typeof data[1][1] === "number")
        {
            const btn = document.createElement("button");
            btn.innerHTML = "Graph " + data[0][1] + " vs. " + data[0][0];
            btn.addEventListener("click", () => {
                output.removeChild(btn);
                output.appendChild(renderGraph(data.slice()));
            });
            output.appendChild(btn);
        }
    })
    .catch(e => {
        output.innerHTML = `<p style="color: red; margin: 20px; font-family: monospace;">${e}</p>`;
    })
    .then(() => {
        input.disabled = false;
        expandedInput.disabled = false;
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

    // // Special formatting for date
    // if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(str)) {
    //     const d = new Date(str);
    //     return formatDate(d);
    // }

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


function renderNode (node) {
    const DEBUG_NODE_TYPES = Object.keys(NODE_TYPES);

    const type = DEBUG_NODE_TYPES[node.type].toLowerCase().replace(/[ _]/g, "-");
    const name = String(node.id !== null ? node.id : (node.type === NODE_TYPES.LIST ? "LIST" : ''));
    const id = name.toLowerCase().replace(/[ _]/g, "-");
    const source = (node.source || "");
    const innerSource = source.replace(/ +AS +"?[a-zA-Z0-9_.]+"? *$/, "");
    return `<div class="node-type-${type} node-id-${id}" title="${innerSource.replace(/"/g, '&quot;')}">
        ${name ? `<span class="node-id">${name}</span>` : ''}
        ${Array.isArray(node.children) ? `<ul>${node.children.map(c => {
            const source = (c.source || "");
            const aliasSource = source.match(/ +AS +"?[a-zA-Z0-9_.]+"? *$/);
            return `<li title="${source.replace(/"/g, '&quot;')}">
                ${c.alias?`<span class="node-alias" title="${aliasSource ? aliasSource[0].replace(/"/g, '&quot;') : ''}">${c.alias}</span>`:''}
                ${renderNode(c)}
            </li>`
        }).join('')}</ul>` : ''}
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