/*
 * Here is a sample for running the script:
 *
 * node ./build-png-icons.ts -o "path/to/results" -c "#898F9E"
 *
 * Currently, images generated from this script are saved in this repo: https://github.com/TeamCodeStream/static_content
 * All you have to do is copy + commit your images to that repo.
 * After images are pushed (to master), a publish script will auto-copy them to our bucket in the cloud
 *
 * to build the icons for the editor gutters, cd to the root of the codestream repo and run:
 * node shared/ui/utilities/build-png-icons.ts -o "vscode/assets/images/" -e
 * node shared/ui/utilities/build-png-icons.ts -o "shared/ui/assets/icons/" -e
 */

const COLOR_MAP = {
	blue: "#3578ba",
	green: "#7aba5d",
	yellow: "#edd648",
	orange: "#f1a340",
	red: "#d9634f",
	purple: "#b87cda",
	aqua: "#5abfdc",
	gray: "#888888"
};

const { convert } = require("convert-svg-to-png");
const icons8 = require("../Stream/icons8-data.json");
const octicons = require("@primer/octicons");
const fs = require("fs");
const yargs = require("yargs");

const argv = yargs
	.command("build-png-icons", "Converts CodeStream SVGs into PNG icons", {})
	.option("size", {
		alias: "s",
		description: "the size of the pngs in pixels",
		type: "number",
		default: 32
	})
	.option("color", {
		alias: "c",
		description: "the color of the icons",
		type: "string",
		default: ""
	})
	.option("output-directory", {
		alias: "o",
		description: "the output directory",
		type: "string",
		default: "/tmp/"
	})
	.option("name", {
		alias: "n",
		description: "if you want a single icon, use its name here",
		type: "string",
		default: ""
	})
	.option("editor", {
		alias: "e",
		description: "build all of the icons we need for the editor",
		type: "boolean",
		default: false
	})
	.help()
	.alias("help", "h").argv;

const dir = argv["output-directory"];
const convertIcon = async (icon, color, filename = dir + icon.name + ".png", type = "png") => {
	const viewBox = icon.viewBox || (icon.options ? icon.options.viewBox : "0 0 16 16");

	let imageContents;
	if (type === "png") {
		const svgTag = `<svg width="${argv.size}" height="${argv.size}" fill="${color}" viewBox="${viewBox}">`;
		const svgString = svgTag + icon.path + "</svg>";
		imageContents = await convert(svgString, {});
	} else if (type === "svg") {
		const svgTag = `<svg xmlns="http://www.w3.org/2000/svg" fill="${color}" viewBox="${viewBox}">`;
		imageContents = `${svgTag}\n    ${icon.path}\n</svg>`;
	} else {
		return console.log("Uknown image type: ", type);
	}

	await fs.writeFile(filename, imageContents, function(err) {
		if (err) return console.log(err);
		console.log("The file " + filename + " was saved!");
	});
};

const convertIcons = async hash => {
	const color = argv.color ? COLOR_MAP[argv.color] || argv.color : "#898F9E";
	const filter = _ => (argv.name ? _.name === argv.name : true);
	const array = Object.values(hash).filter(filter);
	for (let index = 0; index < array.length; index++) {
		await convertIcon(array[index], color);
	}
};

const convertEditorIcons = async () => {
	const icons = ["comment", "issue", "bookmark", "pull-request", "prcomment", "question", "trap"];
	const colors = ["green", "purple", "gray", "blue", "aqua", "red", "yellow", "orange"];
	for (let index = 0; index < icons.length; index++) {
		const icon = icons[index];
		for (let c = 0; c < colors.length; c++) {
			const colorHash = COLOR_MAP[colors[c]];
			let filename = dir + "marker-" + icon + "-" + colors[c] + ".png";
			await convertIcon(icons8[icon], colorHash, filename);
			filename = dir + "marker-" + icon + "-" + colors[c] + ".svg";
			await convertIcon(icons8[icon], colorHash, filename, "svg");
		}
	}
};

if (argv.editor) {
	convertEditorIcons();
} else {
	convertIcons(icons8);
	convertIcons(octicons);
}
