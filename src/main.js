import Database from "better-sqlite3";
import {Cluster} from "puppeteer-cluster-ntaulbut";
import {consola} from "consola";
import cliProgress from "cli-progress";
import moment from "moment";
import pino from "pino";
import {split} from "./tools.js";
import * as selectors from "./selectors.js";

const taskIndexSchools = async ({page, data: url}) => {
	await page.goto(url);

	school_codes = await page.evaluate(() => {
		const elements = Array.from(document.querySelectorAll("#UN_PLN_EXRT_WRK_DESCRFORMAL option"));
		return elements.map(element => element.value);
	})

	school_codes = school_codes.filter(text => text !== "");
}

const taskIndexModules = async ({page, data}) => {
	await page.goto(data.url);

	moduleRowIDs[data.school_code] = await page.evaluate(() => {
		const elements = Array.from(document.querySelectorAll(".ps_grid-body .ps_grid-row"));
		return elements.map(element => element.id);
	});

	data.totalBar.increment();
}

const taskDownloadModules = async ({page, data}) => {
	await page.goto(data.url);

	data.myBar = data.multiBar.create(data.myRowIDs.length, 0, undefined, undefined);
	data.myBar.update(0, {title: data.school_code.padEnd(15)});

	const selectAndEvaluate = async (selector, evaluator) => {
		try {
			const el = await page.waitForSelector(selector);
			return await el.evaluate(evaluator);
		} catch (e) {
			logger.warn(`Caught error: ${e.stack}`)
			return "";
		}
	}
	const selectTable = async (selector) => await page.evaluate((selector) => {
		const elements = Array.from(document.querySelectorAll(selector));
		return elements.map(
			el => el.textContent.split(" ").map(e => e.trim()).join(" "))
			.join("|");
	}, selector);

	const textContent = el => el.textContent.trim();
	const commaSeparatedContent = el => el.textContent.split(",").map((e) => e.trim()).join(",");
	const htmlContent = el => el.innerHTML.replace(/<!--.*?-->/g, "").trim();

	for (const id of data.myRowIDs) {
		const sel_stmt = db.prepare("SELECT COUNT(*) count FROM modules WHERE row_id=?");
		if (sel_stmt.get(data.school_code + id).count !== 0) {
			data.myBar.increment();
			modules++;
			data.totalBar.update({modules: modules});
			continue;
		}

		const rowSelector = `[id="${id}"]`;
		await page.waitForSelector(rowSelector);
		await page.click(rowSelector);

		const stmt = db.prepare(`
            INSERT
            OR IGNORE
            INTO modules
            VALUES (${Array(22).fill("?").join(", ")})
		`);

		await page.setDefaultTimeout(15000);
		stmt.run(
			await selectAndEvaluate(selectors.CODE, textContent),
			data.campus,
			await selectAndEvaluate(selectors.TITLE, textContent),
			await selectAndEvaluate(selectors.YEAR, textContent),
			Number(await selectAndEvaluate(selectors.CREDITS, textContent)),
			Number(await selectAndEvaluate(selectors.LEVEL, textContent)),
			await selectAndEvaluate(selectors.SCHOOL, textContent),
			await selectAndEvaluate(selectors.SEMESTERS, textContent),

			await selectAndEvaluate(selectors.SUMMARY, htmlContent),
			await selectAndEvaluate(selectors.TARGET_STUDENTS, textContent),
			await selectAndEvaluate(selectors.ADDITIONAL_REQUIREMENTS, textContent),
			await selectAndEvaluate(selectors.EDUCATIONAL_AIMS, htmlContent),
			await selectTable(selectors.CO_REQUISITES),
			await selectAndEvaluate(selectors.LEARNING_OUTCOMES, htmlContent),
			await selectTable(selectors.CLASSES),
			await selectAndEvaluate(selectors.CLASSES_INFO, textContent),
			await selectTable(selectors.ASSESSMENT),
			await selectAndEvaluate(selectors.ASSESSMENT_INFO),
			await selectAndEvaluate(selectors.CONVENERS, commaSeparatedContent),

			page.url(),
			moment().unix(),

			data.school_code + id
		);

		data.myBar.increment();
		modules++;
		data.totalBar.update({modules: modules});

		await page.goBack();
	}
	data.multiBar.remove(data.myBar);
	data.totalBar.increment();
}

function campusURL(campus_code) {
	return `https://campus.nottingham.ac.uk/psc/csprd_pub/EMPLOYEE/HRMS/c/UN_PROG_AND_MOD_EXTRACT.UN_PLN_EXTRT_FL_CP.GBL?PAGE=UN_PLN_EXT1_FPG&CAMPUS=${campus_code}&TYPE=Module`;
}

function moduleListURL(year, campus_code, school_code) {
	let title_search = ""
	return `https://campus.nottingham.ac.uk/psc/csprd_pub/EMPLOYEE/HRMS/c/UN_PROG_AND_MOD_EXTRACT.UN_PLN_EXTRT_FL_CP.GBL?PAGE=UN_CRS_EXT2_FPG&CAMPUS=${campus_code}&TYPE=Module&YEAR=${year}&TITLE=${title_search}&SCHOOL=${school_code}`;
}

const HALF_HOUR_IN_MILLISECONDS = 1_800_000;

const db = new Database(process.env.UON_MODULES_DB);
db.pragma("journal_mode = WAL");

const transport = pino.transport({
	target: "pino/file",
	options: {destination: ".log"}
});
const logger = pino(transport);

consola.info(`Using database ${process.env.UON_MODULES_DB}`);
const workers = await consola.prompt("Number of workers:", {type: "text"});
consola.start(`Scraping with ${workers} workers...`);

const campus = await consola.prompt("Campus:", {
	type: "select",
	options: ["Nottingham", "China", "Malaysia"]
});
const campus_code = {
	"Nottingham": "U",
	"China": "C",
	"Malaysia": "M"
}[campus];
const campus_url = campusURL(campus_code);
let year = "2024";

let modules = 0;
let school_codes = [];
let moduleRowIDs = {};

const cluster = await Cluster.launch({
	concurrency: Cluster.CONCURRENCY_CONTEXT, maxConcurrency: parseInt(workers), timeout: HALF_HOUR_IN_MILLISECONDS
});
cluster.on('taskerror', (err, data, willRetry) => {
	data.multiBar?.remove(data.myBar);
	if (willRetry) {
		logger.warn(`Encountered an error while crawling ${data.url}: ${err.stack}`);
	} else {
		logger.error(`Failed to crawl ${data.url}: ${err.stack}`);
	}
});

consola.start("Indexing schools...");
await cluster.queue(campus_url, taskIndexSchools);
moduleRowIDs = Object.fromEntries(school_codes.map(x => [x, undefined]));
await cluster.idle();

consola.start("Indexing modules...");
const collectionTotalBar = new cliProgress.SingleBar({
	format: "  {bar} | {value}/{total} schools"
}, cliProgress.Presets.shades_classic);
collectionTotalBar.start(school_codes.length, 0);
for (const school_code of school_codes) {
	await cluster.queue({
		url: moduleListURL(year, campus_code, school_code), totalBar: collectionTotalBar, school_code: school_code
	}, taskIndexModules)
}
await cluster.idle();
collectionTotalBar.stop();

const totalModules = school_codes.reduce((partialSum, a) => partialSum + moduleRowIDs[a].length, 0);
consola.start("Downloading modules...");
const multiBar = new cliProgress.MultiBar({
	hideCursor: true, forceRedraw: true, autoPadding: true, format: "  {bar} │ {title} │ {value}/{total} modules"
}, cliProgress.Presets.shades_classic);
const totalBar = multiBar.create(school_codes.length, 0, {total_modules: totalModules, modules: 0}, {
	format: "  {bar} │ {value}/{total} schools, {modules} modules ({duration_formatted})"
});

for (const school_code of school_codes) {
	const myModuleRowIds = moduleRowIDs[school_code];
	for (const range of split(myModuleRowIds.length, 20)) {
		await cluster.queue({
			url: moduleListURL(year, campus_code, school_code),
			multiBar: multiBar,
			totalBar: totalBar,
			school_code: school_code,
			campus: campus,
			myRowIDs: myModuleRowIds.slice(range[0], range[1] + 1)
		}, taskDownloadModules);
	}
}

await cluster.idle();
await cluster.close();

multiBar.stop();
consola.success("Finished!");
