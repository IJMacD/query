function query(query) {
    return fetch("/query", {
        method: 'POST',
        body: "query="+encodeURIComponent(query),
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "Accept": "application/json",
        },
    })
    .then(result => result.ok ? result.json() : result.text().then(e => Promise.reject(e)));
}