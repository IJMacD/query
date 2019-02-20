module.exports = {
    explain,
    setAnalysis,
};

function explain (tables, analyse) {
    const out = [];

    if (analyse) {
        // Build Tree
        const analyses = tables.map(t => t.analyse);
        let curr = analyses.shift();

        for (const analyse of analyses) {
            curr = {
                "Node Type": "Nested Loop",
                "Startup Cost": curr["Startup Cost"] + analyse["Startup Cost"],
                "Total Cost": curr["Total Cost"] + analyse["Total Cost"],
                "Plans": [curr, analyse],
                "Actual Startup Time": curr["Startup Cost"] + analyse["Startup Cost"],
                "Actual Total Time": curr["Actual Total Time"] + analyse["Actual Total Time"],
                "Actual Rows": curr["Actual Rows"],
                "Actual Loops": 1,
            };
        }

        out.push(["QUERY PLAN"]);
        // for (const table of parsedTables) {
        //     const a = table.analyse;
        //     out.push([`Seq Scan on ${a["Relation Name"]} ${a["Alias"] !== a["Relation Name"] ? a["Alias"] : ""} (cost=${a["Startup Cost"].toFixed(2)}..${a["Total Cost"].toFixed(2)} rows=${a["Plan Rows"]} width=${a["Plan Width"]})`]);
        // }
        out.push([JSON.stringify([{"Plan": curr, "Total Runtime": curr["Actual Total Time"]}])]);
    }
    else {
        out.push([ "index", ...Object.keys(tables[0]) ]);
        // @ts-ignore
        for (const [i,table] of tables.entries()) {
            out.push([ i, ...Object.values(table).map(formatExplainCol) ]);
        }
    }

    return out;
}

function formatExplainCol (col) {
    return col && (col.source || col);
}

function setAnalysis(table, startupTime, totalTime, planRows, actualRows) {
    table.analyse = {
        "Node Type": "Seq Scan",
        "Relation Name": table.name,
        "Alias": table.alias || table.name,
        "Startup Cost": startupTime,
        "Total Cost": totalTime,
        "Plan Rows": planRows,
        "Plan Width": 1,
        "Actual Startup Time": startupTime,
        "Actual Total Time": totalTime,
        "Actual Rows": actualRows,
        "Actual Loops": 1,
    };
}