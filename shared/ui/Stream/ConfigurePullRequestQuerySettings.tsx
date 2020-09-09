import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "../src/components/Button";
import { Modal } from "./Modal";
import { Dialog, ButtonRow } from "../src/components/Dialog";
import { Checkbox } from "../src/components/Checkbox";
import { setUserPreference } from "./actions";
import { CodeStreamState } from "../store";

interface Props {
	onClose: Function;
}

export function ConfigurePullRequestQuerySettings(props: Props) {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { preferences } = state;

		return {
			allRepos: preferences.pullRequestQueryShowAllRepos,
			hideLabels: preferences.pullRequestQueryHideLabels
		};
	});

	const [showLabelsField, setShowLabelsField] = React.useState(!derivedState.hideLabels);
	const [repoOnlyField, setRepoOnlyField] = React.useState(!derivedState.allRepos);

	const save = () => {
		dispatch(setUserPreference(["pullRequestQueryShowAllRepos"], !repoOnlyField));
		dispatch(setUserPreference(["pullRequestQueryHideLabels"], !showLabelsField));
		props.onClose();
	};

	return (
		<Modal translucent>
			<Dialog title="Pull Request Query Settings" narrow onClose={() => props.onClose()}>
				<form className="standard-form">
					<fieldset className="form-body">
						<div id="controls">
							<div style={{ margin: "20px 0" }}>
								<Checkbox
									name="repo-only"
									checked={repoOnlyField}
									onChange={() => setRepoOnlyField(!repoOnlyField)}
								>
									Only show PRs from repos that are open in my editor
								</Checkbox>
								<Checkbox
									name="hide-labels"
									checked={showLabelsField}
									onChange={() => setShowLabelsField(!showLabelsField)}
								>
									Show Labels
								</Checkbox>
							</div>
						</div>
						<ButtonRow>
							<Button onClick={save}>Save Settings</Button>
						</ButtonRow>
					</fieldset>
				</form>
			</Dialog>
		</Modal>
	);
}
