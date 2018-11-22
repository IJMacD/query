/** @type {HTMLInputElement} */
const input = document.getElementById("input");
const output = document.getElementById("output");
const queryForm = document.getElementById("query-form");
const querySuggest = document.getElementById("query-suggest");

const QUERY_HISTORY = "query_history";
let queryHistory = loadHistory();

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
    if (e.target.localName === "li") {
        input.value = e.target.textContent;
        showSuggestions();
        input.focus();
    }
});

if (location.search) {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.has("q")) {
        input.value = searchParams.get("q");
        sendQuery();
    }
}
input.focus();

function sendQuery () {
    hideSuggestions();
    output.innerHTML = "";
    input.disabled = true;
    const start = Date.now();
    query(input.value)
    .then(data => {
        const duration = (Date.now() - start) / 1000;
        output.innerHTML = renderTable({ rows: data, duration });
        saveHistory(input.value);
    }, e => {
        output.innerHTML = `<p style="color: red; margin: 20px;">${e}</p>`;
    })
    .then(() => {
        input.disabled = false;
    });
}

/**
    * @param {any[][]} rows
    */
function renderTable({ rows, duration }) {
    const headerRow = rows.shift();

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
        return "NULL";
    }

    cell = String(cell);

    // Special Formatting for colour
    if (/^#[0-9a-f]{6}$/i.test(cell)) {
        return `<div style="background-color: ${cell}; height: 20px; width: 20px; margin: 0 auto;" title="${cell}"></div>`;
    }

    // Special formatting for date
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(cell)) {
        const d = new Date(cell);
        if (d.getHours() === 0 && d.getMinutes() === 0) {
            return d.toLocaleDateString(navigator.language);
        }
        return d.toLocaleString(navigator.language);
    }

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

function getSuggestions () {
    return queryHistory.filter(q => q && q != input.value && q.startsWith(input.value));
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
    queryHistory.length = 20;
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