export declare interface Token {
  type: number;
  value?: string;
  start: number;
}

export declare interface Node {
  type: number;
  id: string | number;
  alias?: string;
  inner?: boolean;
  predicate?: Node;
  children?: Node[];
  source?: string;
  window?: string|WindowSpec;
  filter?: Node;
  order?: Node;
  desc?: boolean;
  distinct?: boolean;
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
  cols: Node[];
  parsedTables: ParsedTable[];
  parsedWhere: Node;
  parsedHaving: Node;
  orderBy: Node[];
  groupBy: Node[];
  windows: { [name: string]: WindwSpec };

  CTEs: { [name: string]: any[] };
  views: { [name: string]: string };
  userFunctions: { [name: string]: () => any }
  options: any;

  resolveConstant: (path: string) => string|number|boolean|Date;
  resolvePath: (data: any, path: string) => any;
  resolveValue: (row: ResultRow, col: string) => any;

  findTable: (name: string) => ParsedTable;
  findWhere: (symbol: string, operator?: string|string[]) => string|number;

  setJoin: (table: ParsedTable, targetTable: ParsedTable) => void;
  setJoinPredicate: (table: ParsedTable, predicate: string) => void;

  getRowData: (row: ResultRow, table: ParsedTable) => any;
  setRowData: (row: ResultRow, table: ParsedTable, data: any) => void;
}

export declare interface QueryCallbacks {
  primaryTable: (ParsedFrom) => Promise<any[]>|any[];
  beforeJoin: (ParsedFrom, results: any[]) => Promise;
  afterJoin: (ParsedFrom, results: any[]) => Promise;
  getTables: () => string[];
  getColumns: (tableName: string) => Promise<{ name: string, type: string }[]>;
}

export declare interface ParsedTable {
  name: string;
  join?: string;
  predicate?: Node;
  alias?: string;
  params?: Node[];
  inner?: boolean;
  explain?: string;
  rowCount?: number;
  analyse?: any;
}
