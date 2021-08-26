const fs = require('fs');
const https = require('https');
const iconv = require("iconv-lite");
const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const PDFMerger = require('pdf-merger-js');
const process = require('process');
const chromePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const { PageNode } = require('./pageNode');
const { treeify } = require('./treeify');

class WebsitePrinter {
    constructor(website_root, pdf_name) {
        this.website_root = website_root; //网站根目录
        this.pdf_name = pdf_name; // PDF名称
        this.cacheFile = pdf_name + '.json';
        this.tree = new PageNode(null, this.pdf_name, this.website_root, 0); //层级一
        this.level_links = [];
        ///////////////////////////////////////
        this.chapterEntries = []; //目录名和地址
        this.chapterCount = 0;
        this.chapterEntriesFlat = []; //没有递归的数组
        this.css_container = '';
        this.css_level_one = '';
        this.css_level_two = "";
        this.debug = true;
        this.hasDirtyElement = true;
        this.visible_node = "";
        this.invisible_node_children = [];
        this.dirty_global_nodes = [];
    }
    setEntryCss(css_container, css_level_one, css_level_two) {
        this.css_container = css_container;
        this.css_level_one = css_level_one;
        this.css_level_two = css_level_two;
    }
    setLevelLinks(level_links) {
        this.level_links = level_links;
    }
    setVisibleNode(visible_node) {
        this.visible_node = visible_node;
    }
    setInvisibleNodeChildren(invisible_node_children) {
        this.invisible_node_children = invisible_node_children;
    }
    setDirtyGlobalNodes(dirty_global_nodes) {
        this.dirty_global_nodes = dirty_global_nodes;
    }
    setNoDirtyElement() {
        this.hasDirtyElement = false;
    }
    async build() {
        // 深度遍历
        let count = 0;
        let stack = [[this.website_root, 0, this.tree]];
        while (stack.length) {
            let page = stack.shift();
            let url = page[0];
            let level = page[1];
            let parent = page[2];
            let content = await this.visiteUrl(url);        // 下载单个页面
            let x = this.parseLinksInPage(content, level, parent);  // 解析页面中的url
            count++;
            if (count >= 1) {
                let tree = new treeify();
                console.log(tree.asTree(tree, true));
                break;
            }
        }
    }
    // 访问单个页面
    async visiteUrl(url) {
        return new Promise(function (resolve, reject) {
            const req = https.get(url, (res) => {
                let html = [];
                let size = 0;
                res.on('data', (data) => {
                    html.push(data);
                    size += data.length;
                });
                res.on("end", function () {
                    let buf = Buffer.concat(html, size);
                    let result = iconv.decode(buf, "utf8");//转码//var result = buff.toString();//不需要转编码,直接tostring
                    resolve(result);
                });
            });
            req.on('error', (e) => {
                reject(e);
            });
        });
    }
    // 提取单个页面的URL
    parseLinksInPage(data, level, parent_tree_node) {
        let $ = cheerio.load(data);
        let $container = $(this.level_links[level].container);
        if (this.level_links[level].not) {
            $container = $container.not(this.level_links[level].not);
        }
        $container.each((index, item) => {
            let $a = $(item).find('a');
            $a.each((sub_index, url) => {
                let $url = $(url);
                let href = $url.attr('href');
                let name = $url.text();
                let node = new PageNode(parent_tree_node, name, href, level + 1);
                console.log(href,"    |    ",name);
                parent_tree_node.addChild(node);
            });
        });
    }
    async run2() {
        if (fs.existsSync(this.cacheFile)) {
            let data = fs.readFileSync(this.cacheFile, 'utf-8');
            this.chapterEntries = JSON.parse(data);
            await this.onFinishPdfEntry(null, this);
        } else {
            await this.visitEntry(this.onFinishPdfEntry);
            if (this.debug) {
                return;
            }
        }
        let launchOptions = {
            executablePath: chromePath,
            devTools: true
        };
        puppeteer.launch(launchOptions).then(async browser => {
            await this.printChapters(browser, this.chapterEntriesFlat);
            await browser.close();
        }).then(async () => {
            await this.mergePartPdfFiles(this.chapterEntriesFlat, this.pdfName);
            console.log("完成！ ^_^");
        });

    }
    sleep(time = 0) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, time);
        })
    }

    arrayRecursiveToFlat(arr) {
        for (let i = 0; i < arr.length; i++) {
            this.chapterEntriesFlat.push(arr[i]);
            if (arr[i].children.length > 0) {
                this.arrayRecursiveToFlat(arr[i].children);
            }
        }
    }

    async onFinishPdfEntry(result, that) {
        if (typeof result === 'string') {
            that.parsePdfEntry(result, that);
            that.saveCacheFile();
        }
        that.chapterCount = that.getPageCount(that.chapterEntries);
        that.arrayRecursiveToFlat(that.chapterEntries);
        console.log("\n文章总篇数: ", that.chapterCount, "\n");
    }
    async printChapters(browser, chapters) {
        let chapter_length = chapters.length;
        for (let i = 0; i < chapter_length; i++) {
            let url = chapters[i].href;
            if (url == '') {
                continue;
            }
            let elementId = url.substring(url.lastIndexOf('/') + 1, url.length);
            if (!this.hasDirtyElement) {
                elementId = '';
            }
            let regex = /\//g; //解决特殊字符问题
            let chapter_name = chapters[i].name.replace(regex, "_");
            let current_chapter = this.getPrintChapter((i + 1), chapter_length);
            await this.printPage(current_chapter, browser, url, chapter_name);
            await this.sleep(1000);
        }
    }
    getPrintChapter(i, chapter_count) {
        if (chapter_count >= 100) {
            if (i < 10) {
                return '00' + i;
            } else if (i >= 10 && i <= 99) {
                return '0' + i;
            } else {
                return i;
            }
        } else if (chapter_count >= 10 && chapter_count <= 99) {
            if (i < 10) {
                return '0' + i;
            } else {
                return i;
            }
        }
    }
    async printPage(index, browser, url, filename) {
        console.log(index + ". 打印 " + filename + ".pdf");
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.emulateMediaType('screen');
        if (this.hasDirtyElement) {
            await page.evaluate((visible_node, invisible_node_children, dirty_global_nodes) => {
                // console.log("REMOVE DIRTY ELEMENTS");
                // console.log("VISIBLE_NODE ", visible_node);
                // console.log("INVISIBLE_NODE_CHILDREN ", invisible_node_children);
                const elements = document.querySelector('body').children;
                let isId = visible_node.substr(0, 1) == '#' ? true : false;
                let visible_node_id = visible_node.substring(1);
                for (let i = 0; i < elements.length; i++) {
                    if (isId) {
                        if (elements[i].id != visible_node_id) {
                            elements[i].style.display = 'none';
                        }
                    }
                }
                // 移除全局的Dirty元素
                for (let i = 0; i < dirty_global_nodes.length; i++) {
                    let nodes = document.querySelectorAll(dirty_global_nodes[i]);
                    for (let j = 0; j < nodes.length; j++) {
                        nodes[j].style.display = 'none';
                    }
                }
            }, this.visible_node, this.invisible_node_children, this.dirty_global_nodes);
        }
        await page.pdf({
            path: "./temp/" + filename + '.pdf',
            format: 'A4',
            printBackground: true,
        });
    }

    async mergePartPdfFiles(data, fileName) {
        console.log("\n合并 " + fileName + ".pdf");
        var merger = new PDFMerger();
        for (let i = 0; i < data.length; i++) {
            if (data[i].name == 'Index') {
                continue;
            }
            if (data[i].href == '') {
                continue;
            }
            let regex = /\//g; //解决特殊字符问题
            let chapter_name = data[i].name.replace(regex, "_")
            merger.add("./temp/" + chapter_name + '.pdf');
        }
        await merger.save('./ebooks/' + fileName + '.pdf');
    }
    getPageCount(arr) {
        let total = 0;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i]["children"].length == 0) {
                total += 1;
            } else {
                total += this.getPageCount(arr[i].children);
            }
        }
        return total;

    }
    saveCacheFile() {
        let data = JSON.stringify(this.chapterEntries, null, 4);
        fs.writeFileSync(this.cacheFile, data);
        console.log(data);
    }
    //解析网站目录
    async visitEntry(callback) {
        let that = this;
        const req = https.get(this.pdfEntry, (res) => {
            let html = [];
            let size = 0;
            res.on('data', (data) => {
                html.push(data);
                size += data.length;
            });
            res.on("end", function () {
                let buf = Buffer.concat(html, size);
                let result = iconv.decode(buf, "utf8");//转码//var result = buff.toString();//不需要转编码,直接tostring
                if (typeof callback === 'function') {
                    callback(result, that);
                }
            });
        });
        req.on('error', (e) => {
            console.error(e);
        });
    }
    parsePdfEntry(data, that) {
        let $ = cheerio.load(data);
        let $container = $(that.css_container);
        that.visitChildrenNodes(that, $, $container, 0, that.chapterEntries, that);
    }
    visitChildrenNodes(root, $, $parent, level, parent, that) {
        $parent.each((index, item) => {
            let $a = '';
            if (level == 0) {
                $a = $(item).find(that.css_level_one);
            } else {
                $a = $(item).is('a') ? $(item) : $(item).find(that.css_level_one);
            }
            let _href_ = $a.attr('href');
            let href = '';
            if (_href_ != undefined) {
                if (_href_.substr(0, 4) == 'http') {
                    href = $a.attr('href');
                } else {
                    if (root.rootPrefix !== undefined) {
                        href = root.rootPrefix + $a.attr('href');
                    } else {
                        href = root.pdfEntry + $a.attr('href');
                    }
                }
            }
            let name = $a.text();
            let o = { name: name, href: href, level: level, children: [] };
            let $children = $(item).find(that.css_level_two);
            if ($children.length) {
                root.visitChildrenNodes(root, $, $children, level + 1, o.children, that);
            }
            parent.push(o);
        });
    }
}

module.exports = WebsitePrinter;