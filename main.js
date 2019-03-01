!function(t){var e={};function n(r){if(e[r])return e[r].exports;var a=e[r]={i:r,l:!1,exports:{}};return t[r].call(a.exports,a,a.exports,n),a.l=!0,a.exports}n.m=t,n.c=e,n.d=function(t,e,r){n.o(t,e)||Object.defineProperty(t,e,{enumerable:!0,get:r})},n.r=function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})},n.t=function(t,e){if(1&e&&(t=n(t)),8&e)return t;if(4&e&&"object"==typeof t&&t&&t.__esModule)return t;var r=Object.create(null);if(n.r(r),Object.defineProperty(r,"default",{enumerable:!0,value:t}),2&e&&"string"!=typeof t)for(var a in t)n.d(r,a,function(e){return t[e]}.bind(null,a));return r},n.n=function(t){var e=t&&t.__esModule?function(){return t.default}:function(){return t};return n.d(e,"a",e),e},n.o=function(t,e){return Object.prototype.hasOwnProperty.call(t,e)},n.p="",n(n.s=0)}([function(t,e){function n(t){return function(t){if(Array.isArray(t)){for(var e=0,n=new Array(t.length);e<t.length;e++)n[e]=t[e];return n}}(t)||function(t){if(Symbol.iterator in Object(t)||"[object Arguments]"===Object.prototype.toString.call(t))return Array.from(t)}(t)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance")}()}var r=document.getElementById("input"),a=document.getElementById("output"),o=document.getElementById("query-form"),i=document.getElementById("query-suggest"),c="query_history",u=20,l=100,f=function(){var t=localStorage.getItem(c);if(t)try{return JSON.parse(t)}catch(t){}return[]}(),s=!1,d=!0;function p(){if(location.hash){var t=new URLSearchParams(location.hash.substr(1));t.has("q")&&(r.value=t.get("q"),h())}}function h(){m(),a.innerHTML="",r.disabled=!0;var t=Date.now();location.hash="#q="+encodeURIComponent(r.value),document.title="Query: "+r.value,query(r.value).then(function(e){var o,i=(Date.now()-t)/1e3;if(a.innerHTML=function(t){var e=t.rows,n=t.duration,r=e.shift();if(!r)return'<p style="font-weight: bold;">Empty Result Set</p><p>'.concat(n," seconds</p>");return"<table>\n            <thead>\n                <tr>".concat(r.map(function(t){return"<th>".concat(t,"</th>")}).join(""),"</tr>\n            </thead>\n            <tbody>\n                ").concat(e.map(function(t){return"\n                    <tr>".concat(t.map(function(t){return"<td>".concat(function(t){var e=t.cell;if(null===e)return'<span class="null"></span>';if(e instanceof Date)return g(e);var n=String(e);d&&n.includes("<")&&(r={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"},n=n.replace(/[&<>"']/g,function(t){return r[t]}));var r;if(/^#[0-9a-f]{6}$/i.test(n))return'<div style="background-color: '.concat(n,'; height: 20px; width: 20px; margin: 0 auto;" title="').concat(n,'"></div>');if(/^\d{4}-\d{2}-\d{2}/.test(n)){var a=new Date(n);return g(a)}n.includes("<")||(n=(n=n.replace(/https?:\/\/[^,'>" &()[\]]+/g,function(t){var e=t;return/\.(jpe?g|gif|png|webp)$/i.test(t)&&(e=s?'<object data="'.concat(t,'" height="64"></object>'):'<img src="'.concat(t,'" height="64" />')),'<a href="'.concat(t,'" target="_blank">').concat(e,"</a>")})).replace(/[^@,\s]+@[^@,\s]+\.[^@,\s]+/g,function(t){return'<a href="mailto:'.concat(t,'">').concat(t,"</a>")}));return n}({cell:t}),"</td>")}).join(""),"</tr>\n                ")}).join(""),'\n            </tbody>\n            <tfoot><tr><td colspan="').concat(r.length,'">').concat(e.length," rows, ").concat(n," seconds</td></tr></tfoot>\n        </table>")}({rows:e.slice(),duration:i}),o=r.value,(f=f.filter(function(t){return t!==o})).unshift(r.value),f.length=l,localStorage.setItem(c,JSON.stringify(f)),e.length>=3&&e[0].length>=2&&"number"==typeof e[1][0]&&"number"==typeof e[1][1]){var u=a.querySelector("tfoot td");if(u){var p=document.createElement("button");p.className="link",p.innerHTML="Graph",p.addEventListener("click",function(){u.removeChild(p),a.appendChild(function(t){var e=document.createElement("canvas"),r=e.getContext("2d");e.width=300,e.height=300;t.shift();var a=t.map(function(t){return t[0]}),o=t.map(function(t){return t[1]}),i=Math.min.apply(Math,n(a)),c=Math.max.apply(Math,n(a)),u=Math.min.apply(Math,n(o)),l=Math.max.apply(Math,n(o)),f=e.width/(c-i),s=e.height/(l-u),d=e.height;r.strokeStyle="#999",r.strokeRect(0,0,e.width,e.height),r.beginPath(),r.moveTo((a[0]-i)*f,d-(o[0]-u)*s);for(var p=1;p<t.length;p++)r.lineTo((a[p]-i)*f,d-(o[p]-u)*s);return r.strokeStyle="red",r.stroke(),e}(e.slice()))}),u.appendChild(p)}}}).catch(function(t){a.innerHTML='<p style="color: red; margin: 20px;">'.concat(t,"</p>")}).then(function(){r.disabled=!1})}function g(t){return 0===t.getHours()&&0===t.getMinutes()?t.toLocaleDateString(navigator.language):t.toLocaleString(navigator.language)}function v(){return f.filter(function(t){return t&&t!=r.value&&t.startsWith(r.value)}).slice(0,u)}function y(){i.innerHTML=v().map(function(t){return"<li>".concat(t,"</li>")}).join("")}function m(){i.innerHTML=""}o.addEventListener("submit",function(t){t.preventDefault(),h()}),document.addEventListener("keydown",function(t){if("Enter"===t.key)h();else if("Escape"===t.key)m();else if("Tab"===t.key){var e=v();e.length>=1&&(t.preventDefault(),r.value=e[0])}}),document.addEventListener("click",function(t){m()}),r.addEventListener("keyup",function(t){if(t.altKey&&"1234567890".includes(t.key)){t.preventDefault();var e=v()["1234567890".indexOf(t.key)];void 0!==e&&(r.value=e)}else if("Escape"===t.key)return;y()}),i.addEventListener("click",function(t){t.target instanceof HTMLLIElement&&(r.value=t.target.textContent,y(),r.focus())}),window.addEventListener("hashchange",p),p(),r.focus()}]);