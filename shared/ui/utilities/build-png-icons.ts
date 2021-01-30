/*
 * Here is a sample for running the script:
 *
 * node ./build-png-icons.ts -o "path/to/results" -c "#898F9E"
 *
 * Currently, images generated from this script are saved in this repo: https://github.com/TeamCodeStream/static_content
 * All you have to do is copy + commit your images to that repo.
 * After images are pushed (to master), a publish script will auto-copy them to our bucket in the cloud
 */

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
		default: "#898F9E"
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
	.help()
	.alias("help", "h").argv;

const dir = argv["output-directory"];
const convertIcon = async icon => {
	const viewBox = icon.viewBox || (icon.options ? icon.options.viewBox : "0 0 30 30");
	const svgTag = `<svg width="${argv.size}" height="${argv.size}" fill="${argv.color}" viewBox="${viewBox}">`;
	const svgString = svgTag + icon.path + "</svg>";
	const png = await convert(svgString, {});
	fs.writeFile(dir + icon.name + ".png", png, function(err) {
		if (err) return console.log(err);
		console.log("The file " + dir + icon.name + ".png was saved!");
	});
};

const convertIcons = async hash => {
	const filter = _ => (argv.name ? _.name === argv.name : true);
	const array = Object.values(hash).filter(filter);
	for (let index = 0; index < array.length; index++) {
		await convertIcon(array[index]);
	}
};

convertIcons(icons8);
convertIcons(octicons);
