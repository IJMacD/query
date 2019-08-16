JS SQL Query
============
![Build Status](https://travis-ci.com/IJMacD/query.svg?branch=master)

A simple *(read: toy)* SQL implementation made from scratch in pure JS.

Examples
--------

Basic SELECT from a Demo table.

`FROM Test SELECT n,n2,n3` [⯈](https://ijmacd.github.io/query/#q=FROM%20Test%20SELECT%20n%2Cn2%2Cn3)

Basic WHERE clause on a Demo table. SELECT defaults to `SELECT *`.

`FROM Test WHERE n > 2` [⯈](https://ijmacd.github.io/query/#q=FROM%20Test%20WHERE%20n%20%3E%202)

Full CROSS JOIN on Demo tables.

`FROM Test, Test` [⯈](https://ijmacd.github.io/query/#q=FROM%20Test%2CTest)

JOIN with predicate.

`FROM Test AS a, Test AS b ON a.n < b.n` [⯈](https://ijmacd.github.io/query/#q=FROM%20Test%20AS%20a%2C%20Test%20AS%20b%20ON%20a.n%20%3C%20b.n)

There are even some built-in table valued functions.

`FROM RANGE(3,15, 2)` [⯈](https://ijmacd.github.io/query/#q=FROM%20RANGE(3%2C15%2C%202))

LOAD is also a table valued function to load data from an arbritrary url.

`FROM LOAD('https://api.github.com/users/IJMacD/repos'), Owner` [⯈](https://ijmacd.github.io/query/#q=FROM%20LOAD('https%3A%2F%2Fapi.github.com%2Fusers%2FIJMacD%2Frepos')%2C%20Owner)

`FROM LOAD('http://www.reddit.com/r/javascript.json'), data.children AS c, c.data AS d` [⯈](https://ijmacd.github.io/query/#q=FROM%20LOAD('https%3A%2F%2Fwww.reddit.com%2Fr%2Fjavascript.json')%2C%20data.children%20AS%20c%2C%20c.data%20AS%20d)

`FROM LOAD('http://dummy.restapiexample.com/api/v1/employees')` [⯈](https://ijmacd.github.io/query/#q=FROM%20LOAD('http%3A%2F%2Fdummy.restapiexample.com%2Fapi%2Fv1%2Femployees'))
(You might need to "allow unsecure scripts" because restapiexample.com doesn't support https)

You can use expressions in table valued functions.

`FROM RANGE(-7,0), LOAD('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&date=' || DATE(DATEADD(DAY, value))) AS nasa WHERE media_type = 'image' SELECT nasa.*` [⯈](https://ijmacd.github.io/query/#q=FROM%20RANGE(-7%2C0)%2C%20LOAD('https%3A%2F%2Fapi.nasa.gov%2Fplanetary%2Fapod%3Fapi_key%3DDEMO_KEY%26date%3D'%20%7C%7C%20DATE(DATEADD(DAY%2C%20value)))%20AS%20nasa%20WHERE%20media_type%20%3D%20'image'%20SELECT%20nasa.*))

CTEs are supported.

`WITH cte AS (FROM Test_2 WHERE c > 'd') FROM Test, cte ON CHAR(n+97) = c` [⯈](https://ijmacd.github.io/query/#q=WITH%20cte%20AS%20(FROM%20Test_2%20WHERE%20c%20%3E%20'd')%20FROM%20Test%2C%20cte%20ON%20CHAR(n%2B98)%20%3D%20c)

As are window functions.

`FROM Test SELECT n, n2, RANK() OVER(ORDER BY n2)` [⯈](https://ijmacd.github.io/query/#q=FROM%20Test%20SELECT%20n%2C%20n2%2C%20RANK()%20OVER(ORDER%20BY%20n2))

`FROM Test SELECT n, SUM(n) OVER(PARTITION BY n2)` [⯈](https://ijmacd.github.io/query/#q=FROM%20Test%20SELECT%20n%2C%20SUM(n)%20OVER(PARTITION%20BY%20n2))

`FROM Test SELECT n, SUM(n) OVER(ORDER BY n ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` [⯈](https://ijmacd.github.io/query/#q=FROM%20Test%20SELECT%20n%2C%20SUM(n)%20OVER(ORDER%20BY%20n%20ROWS%20BETWEEN%20UNBOUNDED%20PRECEDING%20AND%20CURRENT%20ROW))

Check out the [tests](https://github.com/IJMacD/query/tree/master/test) for more examples of supported features.
