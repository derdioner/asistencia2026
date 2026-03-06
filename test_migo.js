const fetch = require('node-fetch'); // Needs to be fetch or native fetch in modern Node
fetch('https://api.migo.pe/api/v1/dni', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 104DAA81-E330-4D60-AB7A-2F86B3FD4345'
    },
    body: JSON.stringify({ "dni": "12345678" })
}).then(r => r.json()).then(console.log).catch(console.error);
