const { NODE_TYPES } = require('./parser');
const { SymbolError, evaluateConstantExpression } = require('./evaluate');

module.exports = {
  filterRows,
  traverseWhereTree
};

/**
 * @typedef {import('..')} Query
 * @typedef {import('..').QueryContext} QueryContext
 * @typedef {import('..').Node} Node
 * @typedef {import('..').ResultRow} ResultRow
 * @typedef {import('..').ParsedTable} ParsedTable
 */

/**
 * Function to filter rows based on WHERE clause
 * @param {QueryContext} context
 * @param {ResultRow[]} rows
 * @param {Node} condition
 * @return {ResultRow[]}
 */
function filterRows (context, rows, condition, strict = true) {
    if (condition) {
        return rows.filter(r => filterRow(context, r, condition, rows, strict));
    }
    return rows;
}

function filterRow(context, row, condition, rows, strict) {
    // Optimisation.
    // If we're not in strict mode we can return a fail earlier if either
    // side of an AND operator returns exactly false rather than optimistically
    // catching SymbolErrors and returning true
    if (!strict && condition.type === NODE_TYPES.OPERATOR && condition.id === "AND") {
        return filterRow(context, row, condition.children[0], rows, false) && filterRow(context, row, condition.children[1], rows, false);
    }

    try {
        return context.evaluate(row, condition, rows);
    }
    catch (e) {
        if (e instanceof SymbolError) {
            // If we got a symbol error it means we don't have enough
            // symbols yet. If we're not strict we need to return true
            // to carry on. If we are strict then the row fails.
            return !strict;
        }
        else {
            throw e;
        }
    }
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
