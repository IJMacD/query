if (process.env.APP_ENV === "browser") {
  module.exports = {
    /**
     * @param {string} key
     */
    getItem (key) {
      return JSON.parse(localStorage.getItem(key));
    },

    /**
     * @param {string} key
     * @param {any} value
     */
    setItem (key, value) {
      return localStorage.setItem(key, JSON.stringify(value));
    },
  };
} else {
  const fs = require('fs');
  const pkg = require('../package.json');

  const dir = `${process.env.IL_DATA_DIR || "." + pkg.name}/persist`;
  const filename = key => `${dir}/${key}.json`;

  fs.mkdirSync(dir, { recursive: true });

  module.exports = {
    /**
     * @param {string} key
     */
    getItem (key) {
      try {
        return JSON.parse(fs.readFileSync(filename(key), { encoding: "utf8" }));
      } catch (e) {
        return null;
      }
    },

    /**
     * @param {string} key
     * @param {any} value
     */
    setItem (key, value) {
      fs.writeFileSync(filename(key), JSON.stringify(value));
    },
  };
}