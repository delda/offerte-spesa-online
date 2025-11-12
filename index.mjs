import https from 'https';

var server = https.createServer(function (request, response){
  response.writeHead(200, {"Content-Type": "text/plain"});
  response.end("Hello World from expressjs in a Docker container.");
});

server.listen(8000);
console.log("Server running at http://127.0.0.1:8000/");


export const handler = async (event) => {
    let sessionId = null;
    if (typeof event.queryStringParameters !== 'undefined' && typeof event.queryStringParameters.sess !== 'undefined') {
        sessionId = event.queryStringParameters.sess;
    }

    const dateObj = new Date();

    const categoriesUrl = 'https://www.gros.it/ebsn/api/category?filtered=false&hash=w2321001d' + dateObj.toISOString().slice(0, 10) + 't0';

    const productsUrl = 'https://www.gros.it/ebsn/api/products?parent_category_id=1&page=1&page_size=5000&sort=&promo=true&new_product=false&hash=w2321001d' + dateObj.toISOString().slice(0, 10) + 't0';

    try {
        // faccio il crawling delle categorie e le estraggo in un array
        const categoriesJson = await crawlAndInterpret(categoriesUrl);
        const categories = extractCategories(categoriesJson.data.categories)

        // faccio il crawling dei prodotti e li raggruppo per categoria
        const productsJson = await crawlAndInterpret(productsUrl, sessionId);
        const products = extractProducts(productsJson.data.products);        

        const response = {
            statusCode: 200,
            body: createHTML(products, categories, sessionId),
            headers: {
                'Content-Type' : 'text/html'
            }
        };
    return response;
    } catch (e) {
        console.log("ERROR: ", e);
    }
};

// funzione per eseguire la richiesta HTTP e interpretare la risposta JSON
function crawlAndInterpret(url, sessionId = null) {
    return new Promise((resolve, reject) => {
        let options = {};
        if (sessionId) {
            options.headers = { 'Cookie': `JSESSIONID=${sessionId}` };
        }

        // effettua una richiesta HTTP GET all'URL specificato
        const request = https.get(url, options, (response) => {
            let data = '';

            // gestisci i dati ricevuti dalla risposta
            response.on('data', (chunk) => {
                data += chunk;
            });

            // alla fine della risposta, interpreta il corpo come JSON
            response.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (error) {
                    // in caso di problemi, ritorno l'errore
                    reject(error);
                }
            });
        });

        // gestione degli errori di richiesta
        request.on('error', (error) => {
            reject(error);
        });
    });
}

// funzione per estrarre le categorie in un array
function extractCategories(categories, path = {}) {
    categories.forEach(category => {
        path[category['categoryId']] = {
          'parentId': category['parentId'],
          'categoryId': category['categoryId'],
          'name': category['name']
        };

        if (typeof category['categories'] !== 'undefined') {
            return extractCategories(category['categories'], path);
        }
    });
  
  return path;
}

// funzione per raggruppare i prodotti per categoria
function extractProducts(products) {
    let groupedProducts = [];
    products.forEach(item => {
        if (typeof groupedProducts[item['categoryId']] === 'undefined') {
            groupedProducts[item['categoryId']] = [];
        }

        item.discountPercentage = Math.round((item.price - item.priceDisplay) * 100 / item.price);

        groupedProducts[item['categoryId']].push(item);
    });

    return groupedProducts;
}

// funzione per trasformare l'id categoria in una stringa human-readable contenente la gerarchia della categoria
function extractCategoryString(categories, id, separator = ' / ')
{
    let category = categories[id].name;
  
    while (typeof categories[id].parentId !== 'undefined') {
        return extractCategoryString(categories, categories[id].parentId) + separator + category;
    }
  
    return category;
}

// funzione per creare il contenuto HTML
function createHTML(products, categories, sessionId = null) {
    let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>Offerte GROS</title>\n</head>\n<body style="padding: 50px;">\n<table style="margin: auto;">\n';

    if (sessionId) {
        html += `<h3>Utilizzo cookie di sessione: ${sessionId}</h3>\n`;
    }

    html += `<tr style="font-weight: bold; background: #EEE;">
        <td>Thumb</td>
        <td>Marca</td>
        <td>Nome</td>
        <td>Confezione</td>
        <td>Prezzo</td>
        <td>Prezzo PROMO</td>
        <td>Sconto</td>
        <td>Link</td>
    </tr>\n`

    // Aggiungi ogni elemento dell'array al contenuto HTML
    products.forEach(category => {
        const categoryString = extractCategoryString(categories, category[0].categoryId);
        html += `<tr><td colspan='8' style="padding-top: 20px; border-bottom: 1px solid #AAA;font-weight: bold;">${categoryString}</td></tr>`;
        category.forEach(item => {
            const availableStyle = item.available === 0 ? 'text-decoration: line-through;' : '';

            let discountStyle = '';
            if (item.discountPercentage >= 35) {
                discountStyle = 'font-weight: bold; color: #FFA700;';
            }

            if (item.discountPercentage >= 50) {
                discountStyle = 'font-weight: bold; color: #FF5400;';
            }

            if (item.discountPercentage >= 60) {
                discountStyle = 'font-weight: bold; color: #FF0000;';
            }

            html += `<tr style="${availableStyle}">
                <td><img class="lazyload" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII" data-src="https://www.gros.it${item.mediaURL}" alt="${item.name}" width="50" height="50" style="max-height: 50px;max-width: 50px;width: auto;height: auto;"></td>
                <td>${item.vendor.name}</td>
                <td>${item.name}</td>
                <td>${item.description}</td>
                <td>${item.price}</td>
                <td>${item.priceDisplay}</td>
                <td style="${discountStyle}">-${item.discountPercentage}%</td>
                <td><a href="https://www.gros.it/product/${item.slug}" title="${item.name}" target="_blank">Link</a></td>
            </tr>\n`;
        });
    });

    html += "</table>\n";

    // libreria per lazyload immagini
    html += `<script>/*! Lazy Load 2.0.0-rc.2 - MIT license - Copyright 2007-2019 Mika Tuupola */
    !function(t,e){"object"==typeof exports?module.exports=e(t):"function"==typeof define&&define.amd?define([],e):t.LazyLoad=e(t)}("undefined"!=typeof global?global:this.window||this.global,function(t){"use strict";function e(t,e){this.settings=s(r,e||{}),this.images=t||document.querySelectorAll(this.settings.selector),this.observer=null,this.init()}"function"==typeof define&&define.amd&&(t=window);const r={src:"data-src",srcset:"data-srcset",selector:".lazyload",root:null,rootMargin:"0px",threshold:0},s=function(){let t={},e=!1,r=0,o=arguments.length;"[object Boolean]"===Object.prototype.toString.call(arguments[0])&&(e=arguments[0],r++);for(;r<o;r++)!function(r){for(let o in r)Object.prototype.hasOwnProperty.call(r,o)&&(e&&"[object Object]"===Object.prototype.toString.call(r[o])?t[o]=s(!0,t[o],r[o]):t[o]=r[o])}(arguments[r]);return t};if(e.prototype={init:function(){if(!t.IntersectionObserver)return void this.loadImages();let e=this,r={root:this.settings.root,rootMargin:this.settings.rootMargin,threshold:[this.settings.threshold]};this.observer=new IntersectionObserver(function(t){Array.prototype.forEach.call(t,function(t){if(t.isIntersecting){e.observer.unobserve(t.target);let r=t.target.getAttribute(e.settings.src),s=t.target.getAttribute(e.settings.srcset);"img"===t.target.tagName.toLowerCase()?(r&&(t.target.src=r),s&&(t.target.srcset=s)):t.target.style.backgroundImage="url("+r+")"}})},r),Array.prototype.forEach.call(this.images,function(t){e.observer.observe(t)})},loadAndDestroy:function(){this.settings&&(this.loadImages(),this.destroy())},loadImages:function(){if(!this.settings)return;let t=this;Array.prototype.forEach.call(this.images,function(e){let r=e.getAttribute(t.settings.src),s=e.getAttribute(t.settings.srcset);"img"===e.tagName.toLowerCase()?(r&&(e.src=r),s&&(e.srcset=s)):e.style.backgroundImage="url('"+r+"')"})},destroy:function(){this.settings&&(this.observer.disconnect(),this.settings=null)}},t.lazyload=function(t,r){return new e(t,r)},t.jQuery){const r=t.jQuery;r.fn.lazyload=function(t){return t=t||{},t.attribute=t.attribute||"data-src",new e(r.makeArray(this),t),this}}return e});lazyload();</script>\n</body>\n</html>`;

    return html;
}
