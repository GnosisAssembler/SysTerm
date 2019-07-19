#!/usr/bin/env node

const express = require('express')
const si = require('systeminformation');

const commander = require('commander');
const program = new commander.Command();

const app = express()


app.get('/hardware', (req, res) => {

    // SYSTEM info
    si.system()
        .then(data => console.log(data))
        .catch(error => console.error(error));

    // BIOS info
    si.bios()
        .then(data => console.log(data))
        .catch(error => console.error(error));

    // BASEBOARD info
    si.baseboard()
        .then(data => console.log(data))
        .catch(error => console.error(error));

    // CPU info
    si.cpu()
        .then(data => console.log(data))
        .catch(error => console.error(error));

    // MEMORY info
    si.mem()
        .then(data => console.log(data))
        .catch(error => console.error(error));

    // DRIVES info
    si.diskLayout()
        .then(data => console.log(data))
        .catch(error => console.error(error));

    // BATTERY info
    si.battery()
        .then(data => console.log(data))
        .catch(error => console.error(error));

    // GRAPHICS info
    si.graphics()
        .then(data => console.log(data))
        .catch(error => console.error(error));
    
});

app.get('/os', (req, res) => {

    // OS info
    si.osInfo()
        .then(data => console.log(data))
        .catch(error => console.error(error));
    
    // USERS info
    si.users()
        .then(data => console.log(data))
        .catch(error => console.error(error));

});

app.get('/fs', (req, res) => {

    // FILESYSTEM info
    si.fsSize()
        .then(data => console.log(data))
        .catch(error => console.error(error));

});

app.get('/network', (req, res) => {

    // NETWORK info
    si.networkInterfaces()
        .then(data => console.log(data))
        .catch(error => console.error(error));

});


const port = 3000

app.listen(port, () => console.log(`Server listening on port ${port}!`))