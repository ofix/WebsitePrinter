const websitePrinter = require('./WebsitePrinter');
let printer = new websitePrinter('https://en.cppreference.com/w/cpp', 'cppreference', 'https://en.cppreference.com');
let levelLinks = [
    {
        container: ".mainpagetable .row",
        not:".rowtop"
    }
]
printer.setLevelLinks(levelLinks);
printer.build();
