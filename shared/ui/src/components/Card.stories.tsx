import { Card, CardBody, CardBanner, CardFooter } from "./Card";
import React from "react";
import styled from "styled-components";

export default {
	title: "Card",
	component: Card
};

const P = styled.p`
	color: ${props => props.theme.colors.text};
	padding: 0;
	margin: 0;
`;

export const simple = () => (
	<Card>
		<P>This is a card</P>
	</Card>
);

export const withHoverHighlight = () => (
	<Card hoverEffect>
		<P>Hover over me</P>
	</Card>
);

export const withBanner = () => (
	<Card hoverEffect>
		<CardBanner>
			<P>This is a banner for the card</P>
		</CardBanner>
		<CardBody>
			<P>This is a card</P>
		</CardBody>
	</Card>
);

export const withFooter = () => (
	<Card hoverEffect>
		<P>This is a card</P>
		<CardFooter>
			<P>This is the footer of the card</P>
		</CardFooter>
	</Card>
);

export const withFooterAndBanner = () => (
	<Card>
		<CardBanner>
			<P>Banner</P>
		</CardBanner>
		<CardBody>
			<P>Body</P>
		</CardBody>
		<CardFooter>Footer</CardFooter>
	</Card>
);
