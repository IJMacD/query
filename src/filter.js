const { NODE_TYPES } = require('./parser');
const { SymbolError, evaluateConstantExpression } = require('./evaluate');

module.exports = {
  filterRows,
  traverseWhereTree
};

/**
 * @typedef {import('../types').Node} Node
 * @typedef {import('../types').ResultRow} ResultRow
 * @typedef {import('../types').ParsedTable} ParsedTable
 */

/**
 * Function to filter rows based on WHERE clause
 * @param {ResultRow[]} rows
 * @param {Node} condition
 * @return {ResultRow[]}
 */
function filterRows (evaluate, rows, condition, strict = true) {
    if (condition) {
        return rows.filter(r => {
            try {
                return evaluate(r, condition, rows);
            } catch (e) {
                if (e instanceof SymbolError) {
                    // If we got a symbol error it means we don't have enough
                    // symbols yet. If we're not strict we need to return true
                    // to carry on. If we are strict then the row fails.
                    return !strict;
                } else {
                    throw e;
                }
            }
        });
    }
    return rows;
}

/**
 *
 * @param {Node} node
 * @param {string} symbol
 * @param {string|string[]} operator
 * @returns {string|number}
 */
function traverseWhereTree (node, symbol, operator="=") {
  if (node.type !== NODE_TYPES.OPERATOR) {
      return; // undefined
  }

  if (operator === null || node.id === operator ||
      (Array.isArray(operator) && operator.includes(String(node.id))))
  {
      let operand1 = node.children[0];
      let operand2 = node.children[1];

      if (operand2.type === NODE_TYPES.SYMBOL) {
          [ operand1, operand2 ] = [ operand2, operand1 ];
      }

      if (operand1.type === NODE_TYPES.SYMBOL &&
          operand1.id === symbol)
      {
          // We've found the right node
          try {
              // Now try to evaluate it as a constant expression
              return evaluateConstantExpression(operand2);
          } catch (e) {
              return; // undefined
          }
      }
  }
  else if (node.id === "AND") {
      const child1 = traverseWhereTree(node.children[0], symbol, operator);
      if (typeof child1 !== "undefined") {
          return child1;
      }

      const child2 = traverseWhereTree(node.children[1], symbol, operator);
      return child2;
  } else {
      return; // undefined
  }
}
