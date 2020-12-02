# Translating CodeStream

To collaborate with the internationalization of CodeStream's user interface, submit a 
pull request containing the translation of one or more messages to any idiom.

The place to start looking for messages needing translation is 
[shared/ui](https://github.com/TeamCodeStream/codestream/tree/develop/shared/ui).

### Adding translations to existing formatted messages

The `<FormattedMessage/>` component provides internationalization support.
If a message is already implemented in the format
`<FormattedMessage id="..." />` then add the corresponding entry
to the idiom's dictionary under `shared/ui/translations/`.

For example, the message <i>"Privacy Policy"</i> is implemented as 
`<FormattedMessage id="signUp.legal.privacyPolicy">` in `ui/Authentication/Signup.tsx`.
In order to add a Spanish translation, add a corresponding key/value pair
to `shared/ui/translations/es.js`.
```js
export default {
    ...
    "signUp.legal.privacyPolicy": "Política de Privacidad"
}; 
```

If the dictionary for an idiom still does not exist, you can create its .js file in same directory.

### Translating hard-coded messages

Hard-coded messages can also be converted to `<FormattedMessage/>`. The existing text should be specified
as the value for `defaultMessage`.

<i>Hard coded:
```html
<h3>Check Your Email</h3>
```

<i>Using `<FormattedMessage/>`:</i>
```html
<h3>
    <FormattedMessage id="confirmation.checkEmail" defaultMessage="Check Your Email" />
</h3>
```

<i>Corresponding entry in `shared/ui/translations/es.js`:</i>
```js
export default {
    ...
    "confirmation.checkEmail": "Verifica tu correo electrónico"
}; 
```
