const Query = require('../src/query');
const { NODE_TYPES } = require('../src/types');
const { parse } = require('../src/prepare/parser');
const demoProvider = require('../src/providers/demo');
const idbProvider = require('../src/providers/indexeddb');

const q = new Query();
q.addProvider(demoProvider);
q.addProvider(idbProvider, "IDB");

const query = sql => q.run(sql)

query.prepare = sql => {
    const ast = parse(sql);
    return {
        execute: params => q.runSelect(ast, params),
        namedParams: findNamedParams(ast),
    };
};

function findNamedParams (node) {
    const params = new Set();

    function descend (node) {
        if (node.type === NODE_TYPES.PARAM) {
            params.add(node.id);
        }

        if (node.children) {
            node.children.forEach(descend);
        }
    }

    descend(node);

    return [ ...params ];
}

module.exports = query;