import puppeteer from "puppeteer";
import cliProgress from "cli-progress";

/**
 * @typedef {Object} Module
 * @property {string} URL
 * @property {string} Title
 * @property {string} Year
 * @property {string} Code
 * @property {number} Credits
 * @property {number} Level
 * @property {string} School
 * @property {string[]} Conveners
 * @property {string[]} Semesters
 */

function delay(time) {
	return new Promise(function(resolve) {
		setTimeout(resolve, time)
	});
}

const M_TITLE_ID = "#UN_PLN_EXT2_WRK_PTS_LIST_TITLE";
const M_YEAR_ID = "#UN_PLN_EXT2_WRK_ACAD_YEAR";
const M_CODE_ID = "#UN_PLN_EXT2_WRK_SUBJECT_DESCR";
const M_CREDITS_ID = "#UN_PLN_EXT2_WRK_UNITS_MINIMUM";
const M_LEVEL_ID = "#UN_PLN_EXT2_WRK_UN_LEVEL";
const M_SCHOOL_ID = "#UN_PLN_EXT2_WRK_DESCRFORMAL";
const M_CONVENERS_ID = "#UN_PLN_EXT2_WRK_NAME_DISPLAYS_AS";
const M_SEMESTERS_ID = "#UN_PLN_EXT2_WRK_UN_TRIGGER_NAMES";


(async () => {
	console.log("Starting...");
	// Launch the browser and open a new blank page
	const browser = await puppeteer.launch({headless: true});
	const page = await browser.newPage();

	// Computer Science: USC-CS
	let school = "USC-CS";
	let title_search = "Introduction"
	let year = "2024";

	// Navigate the page to a URL
	await page.goto(`https://campus.nottingham.ac.uk/psc/csprd_pub/EMPLOYEE/HRMS/c/
UN_PROG_AND_MOD_EXTRACT.UN_PLN_EXTRT_FL_CP.GBL?PAGE=UN_CRS_EXT2_FPG
&CAMPUS=U
&TYPE=Module
&YEAR=${year}
&TITLE=${title_search}
&Module=
&SCHOOL=${school}`);

	// Set screen size
	await page.setViewport({width: 1080, height: 1024});

	let results /** @type {Module[]} */ = [];

	const moduleRowIDs = await page.evaluate(() => {
		const elements = Array.from(document.querySelectorAll(".ps_grid-body .ps_grid-row"));
		return elements.map(element => element.id);
	});

	const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
	bar.start(moduleRowIDs.length, 1);

	for (const [index, id] of moduleRowIDs.entries()) {
		const rowSelector = `[id="${id}"]`;
		await page.waitForSelector(rowSelector);
		await page.click(rowSelector);

		const titleElement = await page.waitForSelector(M_TITLE_ID);
		const yearElement = await page.waitForSelector(M_YEAR_ID);
		const codeElement = await page.waitForSelector(M_CODE_ID);
		const creditsElement = await page.waitForSelector(M_CREDITS_ID);
		const levelElement = await page.waitForSelector(M_LEVEL_ID);
		const schoolElement = await page.waitForSelector(M_SCHOOL_ID);
		const convenersElement = await page.waitForSelector(M_CONVENERS_ID);
		const semestersElement = await page.waitForSelector(M_SEMESTERS_ID);

		const textContent = el => el.textContent;

		results.push(
			{
				Title: await titleElement.evaluate(textContent),
				Year: await yearElement.evaluate(textContent),
				Code: await codeElement.evaluate(textContent),
				Credits: Number(await creditsElement.evaluate(textContent)),
				Level: Number(await levelElement.evaluate(textContent)),
				School: await schoolElement.evaluate(textContent),
				Conveners: (await convenersElement.evaluate(textContent)).split(",").map(s => s.trim()),
				Semesters: (await semestersElement.evaluate(textContent)).split(",").map(s => s.trim()),
				URL: page.url()
			}
		)

		await page.goBack();
		bar.update(index + 1);
	}

	bar.stop();
	console.log("Finished!");
	console.log(results);
	// await browser.close();
})();