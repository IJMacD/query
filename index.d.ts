export = Query;

declare class Query {
  schema: Query.Schema;
  providers: { [name: string]: Query.Schema };
  views: { [name: string]: string };
  addProvider (schema: Query.Schema, name?: string);
  run (query: string): Promise<Query.ResultRow[]>;
}

declare namespace Query {
  export { NODE_TYPES as NodeTypes } from './src/types';

  export { TOKEN_TYPES as TokenTypes } from './src/types';

  export interface Token {
    type: TokenTypes;
    value?: string;
    start: number;
  }

  export interface Node {
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

  export interface WindowSpec {
    partition?: Node;
    order?: Node;
    frameUnit?: "rows"|"range"|"groups";
    preceding?: number;
    following?: number;
  }

  export class ResultRow extends Array {
    data?: { [join: string]: any };
    ROWID?: string;
  }

  export interface QueryContext {
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
    userFunctions: { [name: string]: (...params) => any }

    outer?: {
      context: QueryContext;
      row: ResultRow;
      rows: ResultRow[];
    }

    params: { [name: string]: any };

    evaluate: (row: ResultRow, node: Node, rows?: ResultRow[]) => Promise<string|number|boolean|Date>;

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

  export interface Schema {
    name?: string;
    callbacks?: QueryCallbacks;
    userFunctions?: { [name: string]: (...params) => any };
  }

  export interface QueryCallbacks {
    primaryTable?: (ParsedFrom) => Promise<any[]>|any[];
    beforeJoin?: (ParsedFrom, results: any[]) => Promise<void>;
    afterJoin?: (ParsedFrom, results: any[]) => Promise<void>;
    getTables?: () => Promise<string[]>|string[];
    getColumns?: (tableName: string) => Promise<{ name: string, type: string }[]>|{ name: string, type: string }[];
    createTable?: (name: string, key?: string) => Promise,
    insertIntoTable?: (name: string, data: object|object[], duplicate?: "error"|"ignore"|"update") => Promise,
    updateTable?: (name: string, update: (data: object) => object, where: (data: object) => boolean) => Promise,
    deleteFromTable?: (name: string, where: (data: object) => boolean) => Promise,
    dropTable?: (name: string) => Promise,
  }

  export interface ParsedTable {
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
    subquery?: Node;
  }
}