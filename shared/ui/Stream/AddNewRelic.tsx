import React, { useState, useCallback, PropsWithChildren } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import { HostApi } from "../webview-api";
import { Button } from "../src/components/Button";
import {
	AddNewRelicIncludeRequestType,
	AddNewRelicIncludeResponse,
	CreateNewRelicConfigFileRequestType,
	CreateNewRelicConfigFileResponse,
	FindCandidateMainFilesRequestType,
	FindCandidateMainFilesResponse,
	InstallNewRelicRequestType,
	InstallNewRelicResponse
} from "../protocols/agent/agent.protocol.nr";
import { logError } from "../logger";
import { FormattedMessage } from "react-intl";
import { Link } from "./Link";
import { TextInput } from "../Authentication/TextInput";
import { Dialog } from "../src/components/Dialog";
import { closeModal } from "./actions";
import { useEffect } from "react";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import * as path from "path-browserify";
import { Position, Range } from "vscode-languageserver-types";
import { highlightRange } from "../Stream/api-functions";
import styled from "styled-components";
import { Step } from "./ReviewNav";

const isNotEmpty = s => s.length > 0;

export const InstallRow = styled.div`
	display: flex;
	align-items: flex-start;
	padding: 10px 0;
`;

export const AddNewRelic = props => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { repoId, path } = state.context.wantNewRelicOptions || {};
		const repo = repoId ? state.repos[repoId] : undefined;
		return { repo, repoPath: path };
	});

	const [licenseKey, setLicenseKey] = useState("");
	const [appName, setAppName] = useState("");
	const [files, setFiles] = useState<string[]>([]);
	const [selectedFile, setSelectedFile] = useState("");
	const [installingLibrary, setInstallingLibrary] = useState(false);
	const [creatingConfig, setCreatingConfig] = useState(false);
	const [insertingRequire, setInsertingRequire] = useState(false);
	const [loading, setLoading] = useState(false);
	const [unexpectedError, setUnexpectedError] = useState(false);
	const [step, setStep] = useState(10);

	const { repo, repoPath } = derivedState;

	useEffect(() => {
		(async () => {
			const response = (await HostApi.instance.send(FindCandidateMainFilesRequestType, {
				type: "nodejs",
				path: repoPath!
			})) as FindCandidateMainFilesResponse;
			if (!response.error) {
				setFiles(response.files);
			}
		})();
	}, ["repoPath"]);

	useEffect(() => {
		if (!repo) {
			// FIXME: what should we really do here?
			dispatch(closeModal());
		}
	}, ["repo"]);

	const onSubmit = async (event: React.SyntheticEvent) => {
		setUnexpectedError(false);
		event.preventDefault();

		setLoading(true);
		try {
			dispatch(closeModal());
		} catch (error) {
			logError(`Unexpected error during New Relic installation: ${error}`);
			setUnexpectedError(true);
		}
		// @ts-ignore
		setLoading(false);
	};

	const onSetLicenseKey = useCallback(
		key => {
			setLicenseKey(key);
			if (key) {
				setUnexpectedError(false);
				setStep(2);
			} else {
				setStep(1);
			}
		},
		["key"]
	);

	const onSetAppName = useCallback(
		name => {
			setAppName(name);
			if (name) {
				setUnexpectedError(false);
				setStep(3);
			} else {
				setStep(2);
			}
		},
		["appName"]
	);

	const onInstallLibrary = async (event: React.SyntheticEvent) => {
		event.preventDefault();
		setInstallingLibrary(true);
		const response = (await HostApi.instance.send(InstallNewRelicRequestType, {
			type: "nodejs",
			cwd: repoPath!
		})) as InstallNewRelicResponse;
		if (response.error) {
			logError(`Unable to install New Relic module: ${response.error}`);
			setUnexpectedError(true);
		} else {
			setUnexpectedError(false);
			setStep(4);
		}
		setInstallingLibrary(false);
	};

	const onCreateConfigFile = async (event: React.SyntheticEvent) => {
		event.preventDefault();
		setCreatingConfig(true);
		const response = (await HostApi.instance.send(CreateNewRelicConfigFileRequestType, {
			type: "nodejs",
			filePath: repoPath!,
			appName,
			licenseKey
		})) as CreateNewRelicConfigFileResponse;
		if (response.error) {
			logError(`Unable to create New Relic config file: ${response.error}`);
			setUnexpectedError(true);
		} else {
			setUnexpectedError(false);
			setStep(5);
		}
		setCreatingConfig(false);
	};

	const onRequireNewRelic = async (event: React.SyntheticEvent) => {
		event.preventDefault();
		setInsertingRequire(true);
		const response = (await HostApi.instance.send(AddNewRelicIncludeRequestType, {
			type: "nodejs",
			file: selectedFile,
			dir: repoPath!
		})) as AddNewRelicIncludeResponse;
		if (response.error) {
			logError(`Unable to add New Relic include to ${selectedFile}: ${response.error}`);
			setUnexpectedError(true);
		} else {
			setUnexpectedError(false);
			setStep(6);
		}
		setInsertingRequire(false);

		const start = Position.create(0, 0);
		const end = Position.create(0, 10000);
		const range = Range.create(start, end);
		const includeFile = path.join(repoPath!, selectedFile);
		highlightRange({
			uri: `file://${includeFile}`,
			range,
			highlight: true
		});
	};

	const fileItems = files.map((file, i) => {
		return {
			key: file,
			label: file,
			checked: selectedFile === file,
			default: i === 0,
			action: () => setSelectedFile(file)
		};
	});

	return (
		<Dialog title="Add App Monitoring" onClose={() => dispatch(closeModal())}>
			<div>
				Start monitoring the performance of an application or service by installing an agent.
			</div>
			<form className="standard-form">
				<fieldset className="form-body">
					<div id="controls">
						<div className="small-spacer" />
						{unexpectedError && (
							<div className="error-message form-error">
								<FormattedMessage
									id="error.unexpected"
									defaultMessage="Something went wrong! Please try again, or "
								/>
								<FormattedMessage id="contactSupport" defaultMessage="contact support">
									{text => <Link href="https://help.codestream.com">{text}</Link>}
								</FormattedMessage>
								.
							</div>
						)}
						<div className="control-group">
							{step > 0 && (
								<InstallRow>
									<Step>1</Step>
									<div>
										<label>
											Paste your{" "}
											<Link href="https://docs.newrelic.com/docs/accounts/accounts-billing/account-setup/new-relic-license-key/">
												New Relic license key
											</Link>
											:
										</label>
										<TextInput
											name="licenseKey"
											value={licenseKey}
											autoFocus
											onChange={onSetLicenseKey}
										/>
									</div>
									<Button>Go</Button>
								</InstallRow>
							)}
							{step > 1 && (
								<InstallRow>
									<Step>2</Step>
									<div>
										<label>Type a name for your application:</label>
										<TextInput name="appName" value={appName} onChange={onSetAppName} />
									</div>
									<Button>Go</Button>
								</InstallRow>
							)}
							{step > 2 && (
								<InstallRow>
									<Step>3</Step>
									<div>
										<label>
											{step > 3 && <span className="checkmark">✔&nbsp;</span>}
											Install the New Relic node module in your repo:
											<code>npm install --save newrelic</code>
										</label>
									</div>
									<Button onClick={onInstallLibrary} isLoading={installingLibrary}>
										Install
									</Button>
								</InstallRow>
							)}
							{step > 3 && (
								<InstallRow>
									<Step>4</Step>
									<div>
										<label>
											{step > 4 && <span className="checkmark">✔&nbsp;</span>}
											Create a custom configuration file in <b>{repoPath}</b>
										</label>
									</div>
									<Button onClick={onCreateConfigFile} isLoading={creatingConfig}>
										Create
									</Button>
								</InstallRow>
							)}
							{step > 4 && (
								<InstallRow>
									<Step>5</Step>
									<div>
										<label>
											{step > 5 && <span className="checkmark">✔&nbsp;</span>}
											Add a 'require("newrelic")' to{" "}
										</label>
										<InlineMenu
											key="team-display-options"
											className="subtle no-padding"
											items={fileItems}
										></InlineMenu>
									</div>
									<Button onClick={onRequireNewRelic} isLoading={insertingRequire}>
										Add to File
									</Button>
								</InstallRow>
							)}
							{step > 5 && (
								<InstallRow>
									<Step>6</Step>
									<div>Congratulations! You've installed New Relic for Node JS!</div>

									<Button onClick={onSubmit}>Done</Button>
								</InstallRow>
							)}
						</div>
					</div>
				</fieldset>
			</form>
		</Dialog>
	);
};
