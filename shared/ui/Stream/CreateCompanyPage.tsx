import React from "react";
import { TextInput } from "../Authentication/TextInput";
import { Button } from "../src/components/Button";
import { FormattedMessage } from "react-intl";
import { CodeStreamState } from "../store";
import { useSelector, useDispatch } from "react-redux";
import { switchToTeam, setEnvironment, switchToForeignCompany } from "../store/session/actions";
import { CSCompany } from "@codestream/protocols/api";
import { wait } from "../utils";
import { Dialog } from "../src/components/Dialog";
import { closeModal } from "./actions";
import { createCompany, createForeignCompany } from "../store/companies/actions";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import Tooltip from "./Tooltip";
import Icon from "./Icon";

export function CreateCompanyPage() {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { environmentHosts, environment } = state.configs;
		const { currentTeamId } = state.context;
		return {
			environmentHosts,
			environment,
			currentCompanyId: state.teams[currentTeamId].companyId,
			companies: state.companies
		};
	});

	let regionItems,
		defaultRegion = "";
	if (derivedState.environmentHosts) {
		const usHost = derivedState.environmentHosts["us"];
		regionItems = Object.keys(derivedState.environmentHosts).map(key => ({
			key,
			label: derivedState.environmentHosts![key].name,
			action: () => {
				setRegion(derivedState.environmentHosts![key].name);
			}
		}));
		defaultRegion = derivedState.environmentHosts
			? derivedState.environmentHosts[derivedState.environment]?.name
			: usHost
			? usHost.name
			: "";
	}

	const [companyName, setCompanyName] = React.useState("");
	const [teamNameValidity, setTeamNameValidity] = React.useState(true);
	const [companyNameValidity, setCompanyNameValidity] = React.useState(true);
	const [region, setRegion] = React.useState(defaultRegion);

	const [isLoading, setIsLoading] = React.useState(false);
	const isCompanyNameUnique = (name: string) => {
		return !Object.values(derivedState.companies).some(
			c => c.name.toLowerCase() === name.toLowerCase()
		);
	};

	const isCompanyNameValid = (name: string) => {
		return name.length > 0 && isCompanyNameUnique(name);
	};

	const onValidityChanged = (field: string, validity: boolean) =>
		field === "company" ? setTeamNameValidity(validity) : setCompanyNameValidity(validity);

	const validateOrgName = (name: string) => {
		const valid = isCompanyNameValid(name);
		setCompanyNameValidity(valid);
		return valid;
	};

	const onSubmit: React.FormEventHandler = async e => {
		e.preventDefault();
		if (!validateOrgName(companyName)) return;

		setIsLoading(true);

		try {
			if (
				derivedState.environmentHosts &&
				region !== derivedState.environmentHosts[derivedState.environment].name
			) {
				const key = Object.keys(derivedState.environmentHosts).find(
					key => derivedState.environmentHosts![key].name === region
				);
				if (key) {
					const host = derivedState.environmentHosts[key];
					// what's not to love about code like this?
					const company = ((await dispatch(
						createForeignCompany({ name: companyName }, host)
					)) as unknown) as CSCompany;
					// artificial delay to ensure analytics from creating the team are actually processed before we logout below
					await wait(1000);
					await dispatch(switchToForeignCompany(company.id));
				}
			} else {
				const team = ((await dispatch(
					createCompany({ name: companyName })
				)) as unknown) as CSCompany;
				// artificial delay to ensure analytics from creating the team are actually processed before we logout below
				await wait(1000);
				await dispatch(switchToTeam(team.id));
			}
		} catch (error) {
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog title="Create an Organization" onClose={() => dispatch(closeModal())}>
			<form className="standard-form" onSubmit={onSubmit}>
				<fieldset className="form-body">
					<div id="controls">
						<div className="control-group">
							<label>
								<FormattedMessage id="createCompany.name.label" />
							</label>
							<TextInput
								name="company"
								value={companyName}
								onChange={setCompanyName}
								validate={isCompanyNameValid}
								onValidityChanged={onValidityChanged}
								required
								autoFocus
							/>
							{!teamNameValidity && (
								<small className="explainer error-message">
									{companyName.length === 0
										? "Required"
										: !isCompanyNameUnique(companyName) && "Name already in use"}
								</small>
							)}
							{regionItems && (
								<>
									<br />
									<br />
									Region: <InlineMenu items={regionItems}>{region}</InlineMenu>{" "}
									<Tooltip
										title={`Select the region where the CodeStream data for this organization should be stored.`}
									>
										<Icon name="question" />
									</Tooltip>
								</>
							)}
						</div>
						<br />
						<div className="button-group">
							<Button variant="primary" isLoading={isLoading}>
								<FormattedMessage id="createCompany.submitButton" />
							</Button>
						</div>
					</div>
				</fieldset>
			</form>
		</Dialog>
	);
}
