"use strict";

import { promisify } from "util";
import { exec } from "child_process";
import { constants as fsConstants, promises as fsPromises, PathLike } from "fs";

export const execAsync = promisify(exec);

export const existsAsync = async function(file: PathLike) {
	try {
		await fsPromises.access(file, fsConstants.F_OK);
		return true;
	} catch (error) {
		return false;
	}
};
