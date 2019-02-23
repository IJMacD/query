const {
  VALUE_FUNCTIONS,
  AGGREGATE_FUNCTIONS,
  WINDOW_FUNCTIONS,
  TABLE_VALUED_FUNCTIONS
} = require('./const');

module.exports = {
  informationSchema,
};

const Query = require('./query');

async function informationSchema({ findWhere, options, views, options: { callbacks } }, schema) {
    switch (schema) {
        case "tables": {
            const results = [];
            let table_type = "BASE TABLE";

            if (typeof callbacks.getTables === "function") {
                results.push(...callbacks.getTables().map(table_name => ({
                    table_catalog: options.name,
                    table_name,
                    table_type
                })));
            }

            table_type = "VIEW";
            for (const table_name in views) {
                results.push({
                    table_catalog: options.name,
                    table_name,
                    table_type
                });
            }

            return results;
        }
        case "columns": {
            const results = [];
            const whereName = findWhere("table_name");

            if (typeof callbacks.getTables === "function" &&
                typeof callbacks.getColumns === "function") {
                const tables = callbacks.getTables();

                for (const table_name of tables) {
                    if (!whereName || table_name === whereName) {
                        const cols = await callbacks.getColumns(table_name);
                        results.push(...cols.map(({ name, type }, i) => ({
                            table_catalog: options.name,
                            table_name,
                            column_name: name,
                            ordinal_position: i + 1,
                            data_type: type,
                        })));
                    }
                }
            }

            // for (const table_name in views) {
            //     if (!whereName || table_name === whereName) {
            //         const rows = await Query(views[table_name], options);
            //         const headers = rows[0];
            //         for (let i = 0; i < headers.length; i++) {
            //             results.push({
            //                 table_name,
            //                 column_name: headers[i],
            //                 ordinal_position: i + 1,
            //                 data_type: rows.length > 1 ? typeof rows[1][i] : null,
            //             });
            //         }
            //     }
            // }

            return results;
        }
        case "views": {
            const results = [];

            for (const table_name in views) {
                results.push({
                    table_catalog: options.name,
                    table_name,
                    view_definition: views[table_name]
                });
            }

            return results;
        }
        case "routines": {
            const results = [];

            function formatRoutine(routine_name, fn, data_type = null) {
                const definition = String(fn);
                const nativeMatch = /function ([a-zA-Z]+)\(\) { \[native code\] }/.exec(definition);

                return {
                    routine_name,
                    routine_type: "FUNCTION",
                    data_type,
                    routine_body: "EXTERNAL",
                    routine_definition: nativeMatch ? null : definition,
                    external_name: nativeMatch ? nativeMatch[1] : routine_name,
                    external_language: nativeMatch ? "c" : "js",
                };
            }

            for (const name in VALUE_FUNCTIONS) {
                results.push(formatRoutine(name, VALUE_FUNCTIONS[name]));
            }

            for (const name in AGGREGATE_FUNCTIONS) {
                results.push(formatRoutine(name, AGGREGATE_FUNCTIONS[name]));
            }

            for (const name in TABLE_VALUED_FUNCTIONS) {
                results.push(formatRoutine(name, TABLE_VALUED_FUNCTIONS[name], "table"));
            }

            for (const name in WINDOW_FUNCTIONS) {
                results.push(formatRoutine(name, WINDOW_FUNCTIONS[name]));
            }

            return results;
        }
        case "routine_columns": {
            const results = [];
            const whereName = findWhere("table_name");

            for (const table_name in TABLE_VALUED_FUNCTIONS) {
                if (!whereName || table_name === whereName) {
                    results.push({
                        table_name,
                        column_name: "value",
                        ordinal_position: 1,
                        data_type: null,
                    });
                }
            }

            return results;
        }
    }
}