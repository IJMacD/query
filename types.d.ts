export declare enum TokenTypes {
  UNKNOWN = 0,
  BRACKET = 1,
  COMMA = 2,
  KEYWORD = 3,
  NAME = 4,
  STRING = 5,
  NUMBER = 6,
  OPERATOR = 7,
}

export declare enum NodeTypes {
  UNKNOWN = 0,
  STATEMENT = 1,
  CLAUSE = 2,
  FUNCTION_CALL = 3,
  SYMBOL = 4,
  STRING = 5,
  NUMBER = 6,
  OPERATOR = 7,
  LIST = 8,
}

export declare interface Token {
  type: TokenTypes;
  value?: string;
  start: number;
}

export declare interface Node {
  type: NodeTypes;
  id: string | number;
  alias?: string;
  using?: string;
  inner?: boolean;
  predicate?: Node;
  children?: Node[];
  source?: string;
  window?: string|WindowSpec;
  filter?: Node;
  order?: Node;
  desc?: boolean;
  distinct?: boolean;
  headers?: string[];
}

export declare interface WindowSpec {
  partition?: Node;
  order?: Node;
  frameUnit?: "rows"|"range"|"groups";
  preceding?: number;
  following?: number;
}

export declare class ResultRow extends Array {
  data?: { [join: string]: any };
  ROWID?: string;
}

export declare interface QueryContext {
  query: Query;

  cols: Node[];
  colHeaders: string[];
  colAlias: { [alias: string]: number };

  tables: ParsedTable[];
  where: Node;
  having: Node;
  orderBy: Node[];
  groupBy: Node[];
  windows: { [name: string]: WindowSpec };

  subqueries: { [name: string]: any[] };
  CTEs: { [name: string]: any[] };
  views: { [name: string]: string };

  schema: Schema;
  providers: { [name: string]: Schema };
  userFunctions: { [name: string]: () => any }

  outer?: {
    context: QueryContext;
    row: ResultRow;
    rows: ResultRow[];
  }

  evaluate: (row: ResultRow, node: Node, rows?: ResultRow[]) => string|number|boolean|date;

  resolveConstant: (path: string) => string|number|boolean|Date;
  resolvePath: (data: any, path: string) => any;
  resolveValue: (row: ResultRow, col: string, rows?: ResultRow[]) => string|number|boolean|Date;

  findTable: (name: string) => ParsedTable;
  findWhere: (symbol: string, operator?: string|string[]) => string|number|boolean|Date;

  setJoin: (table: ParsedTable, targetTable: ParsedTable) => void;
  setJoinPredicate: (table: ParsedTable, predicate: string) => void;

  getRowData: (row: ResultRow, table: ParsedTable) => any;
  setRowData: (row: ResultRow, table: ParsedTable, data: any) => void;
}

export declare interface Schema {
  name?: string;
  callbacks?: QueryCallbacks;
  userFunctions?: { [name: string]: () => any };
}

export declare interface QueryCallbacks {
  primaryTable?: (ParsedFrom) => Promise<any[]>|any[];
  beforeJoin?: (ParsedFrom, results: any[]) => Promise;
  afterJoin?: (ParsedFrom, results: any[]) => Promise;
  getTables?: () => string[];
  getColumns?: (tableName: string) => Promise<{ name: string, type: string }[]>|{ name: string, type: string }[];
}

export declare interface ParsedTable {
  name: string;
  join?: string|[ParsedTable, string];
  predicate?: Node;
  alias?: string;
  headers?: string[];
  params?: Node[];
  inner?: boolean;
  explain?: string;
  rowCount?: number;
  analyse?: any;
  symbol: Symbol;
}

import Query from './src/query';

export = Query;