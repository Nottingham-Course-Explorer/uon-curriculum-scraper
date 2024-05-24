import Database from "better-sqlite3";
import {Cluster} from "puppeteer-cluster-ntaulbut";
import {consola} from "consola";
import cliProgress from "cli-progress";
import moment from "moment";
import pino from "pino";

/**
 * @typedef {Object} Module
 * @property {string} Title
 * @property {string} Year
 * @property {string} Code
 * @property {number} Credits
 * @property {number} Level
 * @property {string} School
 * @property {string} Conveners
 * @property {string} Semesters
 *
 * @property {string} TargetStudents
 * @property {string} Summary
 * @property {string} EducationalAims
 * @property {string} AssessmentPeriod
 * @property {string} LearningOutcomes
 *
 * @property {string} URL
 */

const M_TITLE_SEL = "#UN_PLN_EXT2_WRK_PTS_LIST_TITLE";
const M_YEAR_SEL = "#UN_PLN_EXT2_WRK_ACAD_YEAR";
const M_CODE_SEL = "#UN_PLN_EXT2_WRK_SUBJECT_DESCR";
const M_CREDITS_SEL = "#UN_PLN_EXT2_WRK_UNITS_MINIMUM";
const M_LEVEL_SEL = "#UN_PLN_EXT2_WRK_UN_LEVEL";
const M_SCHOOL_SEL = "#UN_PLN_EXT2_WRK_DESCRFORMAL";
const M_CONVENERS_SEL = "#UN_PLN_EXT2_WRK_NAME_DISPLAYS_AS";
const M_SEMESTERS_SEL = "#UN_PLN_EXT2_WRK_UN_TRIGGER_NAMES";
const M_TARGET_STUDENTS_SEL = "#win0divUN_PLN_EXT2_WRK_HTMLAREA10 .ps-htmlarea";

const M_SUMMARY_SEL = "#win0divUN_PLN_EXT2_WRK_HTMLAREA11 .ps-htmlarea";
const M_EDU_AIMS_SEL = "#win0divUN_PLN_EXT2_WRK_HTMLAREA12 .ps-htmlarea";
const M_ADD_REQUIREMENTS_SEL = "#win0divUN_PLN_EXT2_WRK_IB_REQSEND .ps-htmlarea";
const M_CLASS_TABLE_SEL = "#win0divUN_PLN_EXT2_WRK_ACA_FREQ .ps_grid-cell:not(.ptgrid-rownumber)";
const M_CLASS_INFO_SEL = "#win0divUN_PLN_EXT2_WRK_UN_ACTIVITY_INFO .ps-htmlarea"
const M_ASSESS_TABLE_SEL = "#win0divUN_CRS_ASAI_TBL\\$grid\\$0 .ps_grid-cell:not(.ptgrid-rownumber)";
const M_ASSESS_INFO_SEL = "#win0divUN_PLN_EXT2_WRK_UN_DESCRFORMAL .ps-htmlarea";
const M_LEARN_OUTCOMES_SEL = "#UN_PLN_EXT2_WRK_UN_LEARN_OUTCOME";

const db = new Database(process.env.UON_MODULES_DB);
db.pragma("journal_mode = WAL");

const transport = pino.transport({
	target: "pino/file",
	options: {destination: ".log"}
});
const logger = pino(transport);

function campusURL(campus_code) {
	return `https://campus.nottingham.ac.uk/psc/csprd_pub/EMPLOYEE/HRMS/c/UN_PROG_AND_MOD_EXTRACT.UN_PLN_EXTRT_FL_CP.GBL?PAGE=UN_PLN_EXT1_FPG&CAMPUS=${campus_code}&TYPE=Module`;
}

function moduleListURL(year, campus_code, school_code) {
	let title_search = ""
	return `https://campus.nottingham.ac.uk/psc/csprd_pub/EMPLOYEE/HRMS/c/UN_PROG_AND_MOD_EXTRACT.UN_PLN_EXTRT_FL_CP.GBL?PAGE=UN_CRS_EXT2_FPG&CAMPUS=${campus_code}&TYPE=Module&YEAR=${year}&TITLE=${title_search}&SCHOOL=${school_code}`;
}

let school_codes = [];

const indexSchoolsTask = async ({page, data: url}) => {
	await page.goto(url);

	school_codes = await page.evaluate(() => {
		const elements = Array.from(document.querySelectorAll("#UN_PLN_EXRT_WRK_DESCRFORMAL option"));
		return elements.map(element => element.value);
	})

	school_codes = school_codes.filter(text => text !== "");
}

let moduleRowIDs = {};

const indexModulesTask = async ({page, data}) => {
	await page.goto(data.url);

	moduleRowIDs[data.school_code] = await page.evaluate(() => {
		const elements = Array.from(document.querySelectorAll(".ps_grid-body .ps_grid-row"));
		return elements.map(element => element.id);
	});

	data.totalBar.increment();
}

const downloadModulesTask = async ({page, data}) => {
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
		const sel_stmt = db.prepare("SELECT COUNT(*) count FROM modules WHERE row_id_TEMP=?");
		if (sel_stmt.get(data.school_code + id).count !== 0) {
			data.myBar.increment();
			modules++;
			data.totalBar.update({modules: modules});
			continue;
		}

		const rowSelector = `[id="${id}"]`;
		await page.waitForSelector(rowSelector);
		await page.click(rowSelector);
		await page.setDefaultTimeout(15_000);

		const module /** @type {Module} */ = {
			Title: await selectAndEvaluate(M_TITLE_SEL, textContent),
			Year: await selectAndEvaluate(M_YEAR_SEL, textContent),
			Code: await selectAndEvaluate(M_CODE_SEL, textContent),
			Credits: Number(await selectAndEvaluate(M_CREDITS_SEL, textContent)),
			Level: Number(await selectAndEvaluate(M_LEVEL_SEL, textContent)),
			School: await selectAndEvaluate(M_SCHOOL_SEL, textContent),
			Conveners: await selectAndEvaluate(M_CONVENERS_SEL, commaSeparatedContent),
			Semesters: await selectAndEvaluate(M_SEMESTERS_SEL, textContent),
			TargetStudents: await selectAndEvaluate(M_TARGET_STUDENTS_SEL, textContent),

			Summary: await selectAndEvaluate(M_SUMMARY_SEL, htmlContent),
			EducationalAims: await selectAndEvaluate(M_EDU_AIMS_SEL, htmlContent),
			AdditionalRequirements: await selectAndEvaluate(M_ADD_REQUIREMENTS_SEL, textContent),
			Classes: await selectTable(M_CLASS_TABLE_SEL),
			ClassesInfo: await selectAndEvaluate(M_CLASS_INFO_SEL, textContent),
			Assessment: await selectTable(M_ASSESS_TABLE_SEL),
			AssessmentInfo: await selectAndEvaluate(M_ASSESS_INFO_SEL),
			LearningOutcomes: await selectAndEvaluate(M_LEARN_OUTCOMES_SEL, htmlContent),

			CrawlURL: page.url(),
			CrawlTime: moment().unix()
		}

		const stmt = db.prepare(`
            INSERT
            OR IGNORE
            INTO modules (code, title, year, credits, level, school, conveners, semesters,
            			  summary, classes, classes_info, assessment, assessment_info, target_students, educational_aims, additional_requirements, learning_outcomes,
                          crawl_url, crawl_time, campus, row_id_TEMP)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		stmt.run(module.Code, module.Title, module.Year, module.Credits, module.Level, module.School, module.Conveners, module.Semesters,
			module.Summary, module.Classes, module.ClassesInfo, module.Assessment, module.AssessmentInfo, module.TargetStudents, module.EducationalAims, module.AdditionalRequirements, module.LearningOutcomes,
			module.CrawlURL, module.CrawlTime, data.campus, data.school_code + id);

		data.myBar.increment();
		modules++;
		data.totalBar.update({modules: modules});

		await page.goBack();
	}
	data.multiBar.remove(data.myBar);
	data.totalBar.increment();
}

function* split(value, tryIntoChunkSize) {
	const chunks = Math.floor(value / tryIntoChunkSize);
	const remainder = value % tryIntoChunkSize;

	if (chunks === 0 && remainder > 0) {
		yield [0, remainder - 1];
	}

	// Fit
	const newChunkSize = tryIntoChunkSize + Math.floor(remainder / chunks);
	const finalChunkSize = newChunkSize + remainder % chunks;

	for (let i = 0; i < chunks; i++) {
		if (i + 1 === chunks) {
			yield [i * newChunkSize, i * newChunkSize + finalChunkSize]
		} else {
			yield [i * newChunkSize, (i + 1) * newChunkSize];
		}
	}
}

const HALF_HOUR_IN_MILLISECONDS = 1_800_000;
let modules = 0;

(async () => {
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
	await cluster.queue(campus_url, indexSchoolsTask);
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
		}, indexModulesTask)
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
			}, downloadModulesTask);
		}
	}

	await cluster.idle();
	await cluster.close();

	multiBar.stop();
	consola.success("Finished!");
})();