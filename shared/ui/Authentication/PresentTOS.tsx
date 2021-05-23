import React, { useCallback, useState } from "react";
import cx from "classnames";
import { CodeStreamState } from "../store";
import { useDispatch, useSelector } from "react-redux";
import { useDidMount } from "../utilities/hooks";
import { Button } from "../src/components/Button";
import styled from "styled-components";
import { acceptTOS } from "../store/session/actions";
import { Checkbox } from "../src/components/Checkbox";
import { Link } from "../Stream/Link";

const Root = styled.div`
	display: flex;
	flex-direction: column;
	height: 100%;
	background: var(--base-background-color);
`;

const Terms = styled.div`
	overflow: auto;
	flex-grow: 10;
	padding: 0 20px;
	background: var(--app-background-color);
	border-top: 1px solid var(--base-border-color);
	border-bottom: 1px solid var(--base-border-color);
	color: var(--text-color-subtle);
`;

const Title = styled.div`
	font-size: larger;
	padding: 20px;
	border-top: 1px solid var(--base-border-color);
`;

const Subtitle = styled.div`
	margin: 20px;
	font-size: larger;
`;

const Agreement = styled.div`
	margin: 10px 20px 0 20px;
`;

export const ButtonRow = styled.div`
	text-align: center;
	button {
		margin: 20px auto;
	}
`;

const PleaseScrollMore = styled.div`
	margin: 10px 0 0 0;
`;

const DownloadLink = styled.div`
	text-align: right;
	margin: 5px 10px 0 0;
`;

export const PresentTOS = () => {
	const dispatch = useDispatch();

	const [scrolledFarEnough, setScrolledFarEnough] = React.useState(false);
	const [inAgreement, setInAgreement] = React.useState(false);
	const [isLoading, setIsLoading] = React.useState(false);

	const handleScroll = event => {
		const { target } = event;
		const atBottom = target.scrollHeight - target.scrollTop === target.clientHeight;
		console.warn("AB: ", atBottom);
		if (atBottom) setScrolledFarEnough(true);
	};

	const accept = async (event: React.SyntheticEvent) => {
		setIsLoading(true);
		await dispatch(acceptTOS());
		setIsLoading(false);
	};

	return (
		<Root>
			<Title>
				CodeStream is excited to share that [news]. Please review our updated Terms of Service.
			</Title>
			<Terms onScroll={handleScroll}>
				<p>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt
					ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation
					ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
					reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur
					sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id
					est laborum.
				</p>

				<p>
					Cras et sapien ex. Suspendisse ut gravida nisl, ac tincidunt ipsum. Duis tempus nibh
					lectus, vitae suscipit leo laoreet ac. Cras venenatis lobortis egestas. Nulla id ex
					tincidunt, sollicitudin orci dapibus, imperdiet enim. Nam orci sem, placerat eget arcu
					posuere, malesuada euismod diam. Etiam pulvinar molestie fermentum. Curabitur non dolor a
					velit tempor efficitur. Maecenas efficitur nec diam eget consequat. Vestibulum eleifend
					massa nunc, vel volutpat nulla maximus vitae. Integer eros sapien, pharetra molestie
					sodales eu, maximus quis nisl. Mauris eu tempus lacus, a fringilla eros. Phasellus at
					consectetur nulla. Etiam tellus mauris, sagittis sit amet leo ut, suscipit tristique
					velit. Duis eget efficitur neque.
				</p>
				<p>
					In hac habitasse platea dictumst. Cras sed orci sed ex aliquam bibendum non ut eros.
					Mauris eget odio eu arcu maximus viverra. Maecenas ligula nibh, luctus eget malesuada sit
					amet, gravida quis nisi. Cras eget vehicula sapien. Quisque maximus eros metus, quis
					volutpat orci tristique vitae. Maecenas vitae eros vitae nisi ultrices convallis. In
					faucibus turpis arcu, porttitor laoreet neque condimentum quis. Fusce a elit nec enim
					blandit rhoncus eget et libero.
				</p>
				<p>
					Suspendisse quis pellentesque dui. Vestibulum ante ipsum primis in faucibus orci luctus et
					ultrices posuere cubilia curae; Aenean quis nisi lorem. Aliquam blandit blandit massa eget
					congue. Curabitur lacinia leo et diam varius, in tristique augue tincidunt. Nunc orci
					quam, cursus a orci ut, egestas rhoncus ante. Vestibulum ante lacus, tempor id scelerisque
					vel, ultricies in ipsum.
				</p>
				<p>
					Curabitur orci magna, feugiat vitae neque eu, dignissim convallis elit. Donec lacus dui,
					convallis id mi id, cursus suscipit odio. Sed pellentesque ornare leo. Vestibulum sed
					lacinia lacus, in vehicula dui. Fusce placerat gravida nulla luctus pellentesque. Etiam
					efficitur urna sit amet interdum gravida. Morbi sagittis at est ut accumsan. Vivamus
					dictum dolor nec eros fermentum commodo. Etiam consequat est sed iaculis luctus. Sed vitae
					rutrum erat. Ut sit amet cursus ante. Mauris feugiat in orci ac elementum. Praesent diam
					arcu, tristique sit amet finibus in, faucibus faucibus felis. Ut varius elit in ultricies
					aliquet. Vestibulum sit amet lacus eu lorem interdum maximus et a elit. Nulla placerat
					sapien vitae nulla vestibulum, ac iaculis leo iaculis.
				</p>
				<p>
					Praesent eu dolor vel dolor aliquet accumsan. Suspendisse aliquam viverra erat sed
					tincidunt. Phasellus eget purus felis. Orci varius natoque penatibus et magnis dis
					parturient montes, nascetur ridiculus mus. Vivamus commodo mollis tortor nec congue.
					Suspendisse venenatis diam a ornare elementum. Etiam sodales turpis eget nibh porttitor,
					nec interdum metus feugiat.
				</p>
				<p>
					Duis rutrum eu purus sed molestie. Nam ac eros vitae lacus consectetur rhoncus. In
					ullamcorper quis velit et tempus. Morbi eu malesuada diam, sed lobortis nibh. Integer
					sagittis magna consequat nisl consectetur, molestie rutrum arcu suscipit. Quisque non
					nulla a elit pretium commodo. Nam fermentum tellus eu arcu efficitur, et aliquet libero
					dignissim. Morbi suscipit lectus risus, in lacinia turpis consectetur a.
				</p>
				<p>
					Suspendisse augue odio, tempor eu enim tempor, malesuada scelerisque elit. Nunc vehicula
					magna vitae rhoncus ultricies. Vestibulum id neque nec est scelerisque interdum
					consectetur vitae massa. Etiam et leo porttitor, malesuada leo nec, venenatis erat. Class
					aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos.
					Morbi volutpat convallis quam, et faucibus mi tempus non. Duis sodales neque velit, quis
					fringilla sem posuere quis. Praesent scelerisque maximus bibendum. Suspendisse viverra
					augue at tortor fringilla mollis.
				</p>
				<p>
					Fusce commodo est sit amet felis posuere porttitor. Nunc id rutrum lorem. Integer tempus
					vestibulum nulla eget congue. Aenean diam lorem, mattis sed feugiat quis, facilisis vel
					neque. Fusce vitae interdum risus, ac consectetur felis. Ut vitae dapibus ligula, id porta
					nisi. Vivamus vel eleifend risus. Sed finibus non metus id malesuada. Duis eleifend
					lacinia neque a egestas. Integer risus tortor, dignissim mollis posuere a, condimentum in
					lorem. Maecenas vehicula magna lectus, eu convallis arcu placerat ac.
				</p>
				<p>
					Pellentesque finibus nibh tortor, quis feugiat libero consequat id. Ut vel nunc velit.
					Suspendisse potenti. Etiam non nulla metus. Nulla lacinia porta fermentum. Aliquam quis
					luctus metus. Nunc pharetra leo id tortor luctus, vitae varius velit condimentum. Morbi
					semper, massa vitae finibus rutrum, odio risus sagittis elit, sit amet porta lectus tellus
					non lacus. Proin laoreet lacinia mauris, in finibus felis venenatis tempor. Nam in ipsum
					rhoncus, commodo erat nec, pellentesque leo.
				</p>
			</Terms>
			<DownloadLink>
				<Link href="https://www.codestream.com/terms">Download</Link>
			</DownloadLink>
			<Agreement>
				{scrolledFarEnough ? (
					<Checkbox
						name="agree"
						checked={inAgreement}
						onChange={() => setInAgreement(!inAgreement)}
					>
						I agree to the above terms of service and{" "}
						<Link href="https://www.codestream.com/privacy">Privacy Policy</Link>
					</Checkbox>
				) : (
					<PleaseScrollMore>
						Please scroll through the entire agreement to proceed.
					</PleaseScrollMore>
				)}
				<ButtonRow>
					<Button isLoading={isLoading} disabled={!inAgreement} onClick={accept}>
						Continue
					</Button>
				</ButtonRow>
			</Agreement>
		</Root>
	);
};
