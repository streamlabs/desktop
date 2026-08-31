applyTo: "app/components/\*\*,app/components-react/\*\*,app/services/\*\*,app/i18n/en-US/\*\*"

Read the entire instructions file before carrying out any checks.

# Tracking Missing Translations

## Plaintext Strings

When code reviewing a PR, check for new plaintext strings added to a tsx or vue template that are not wrapped in a `$t()` function.
These strings need to be wrapped in a `$t()` function to ensure they are translated properly.

Exceptions for strings that do not need to be wrapped in a `$t()` function:

- Recognizable brand names (including Streamlabs and Ultra)
- Internationally recognized abbreviations (i.e. "kbps", "mb", etc)
- Strings that are not apparently recognized english (i.e. "2000", "4/min", "d897gfd79s", etc)
- Special characters (i.e. "&nbsp;")
- Any value of a key marked `value` or `key` in a JS Object
- Any attribute of an HTML tag (anything marked as a `class`, `className`, `name`, `id`, `data-*`, `value` etc)
  - Specific attributes should be translated: `label`, `title`, `message`, and `description`

## Missing translation keys

When code reviewing a PR, check for any strings that have been added wrapped in a `$t()` function.
These strings need to have a corresponding key/value pair added to a relevant file in `app/i18n/en-US/**`.
If the same string wrapped in a `$t()` function cannot be found in the `app/i18n/en-US/**` directory, it should be flagged as a missing translation.

# Tracking Stale Translations

## Removed strings

When code reviewing a PR, check for any strings wrapped in a `$t()` function that have been removed in the changes.
When those strings are removed, they should have a corresponding removal of the same key/value pair in the `app/i18n/en-US/**` directory.
If no such key/value pair has been removed in the PR, it should be flagged as a stale translation.

# New Translations Files

When code reviewing a PR, check for any files added to the `app/i18n/en-US/**` directory, these are new translation files.
Each new file added there must be added as a `require` in the `fallbackDictionary` of `app/i18n/fallback.ts`.
Flag any new translation files not included in the `fallbackDictionary` as needing to be included there.

# Special Considerations

- Do not pay attention to any other directory in `app/i18n/**` outside of `en-US` or `fallback.ts`.
- Do not run these instructions on any PR named `New Crowdin updates`
