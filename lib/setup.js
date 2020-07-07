const slugify = require('@sindresorhus/slugify');

// Find a value for each of the model's fields, to show as examples in the
// various questions.
function getExampleFieldValues(model, objects, maxLength = 60) {
    return objects.reduce((result, object) => {
        const { __metadata: meta, ...fields } = object;
        const isRightModel =
            meta &&
            meta.modelName === model.modelName &&
            meta.projectId === model.projectId &&
            meta.projectEnvironment === model.projectEnvironment &&
            meta.source === model.source;

        if (!isRightModel || !Array.isArray(model.fieldNames)) return result;

        model.fieldNames
            .filter((fieldName) => result[fieldName] === undefined)
            .forEach((fieldName) => {
                if (!['boolean', 'number', 'string'].includes(typeof fields[fieldName])) {
                    return;
                }

                const stringValue = fields[fieldName].toString().trim().substring(0, maxLength);

                if (stringValue.length > 0) {
                    result[fieldName] = stringValue;
                }
            });

        return result;
    }, {});
}

module.exports.getSetupForPage = async ({ chalk, data, inquirer, model, setupData }) => {
    // Let's try to find a value for each of the model's fields, to show as
    // examples in the upcoming questions.
    const exampleFieldValues = getExampleFieldValues(model, data.objects);
    const { pagePath, slugField } = await inquirer.prompt([
        {
            type: 'list',
            name: 'slugField',
            message: `Choose a field to generate the page slug from: ${chalk.dim(
                'Read more about slugs at https://www.stackbit.com/blog/what-is-a-content-slug/'
            )}`,
            choices: (model.fieldNames || [])
                .map((fieldName) => {
                    const example = exampleFieldValues[fieldName] ? ` (e.g. ${slugify(exampleFieldValues[fieldName])})` : '';

                    return {
                        name: fieldName + example,
                        short: fieldName,
                        value: fieldName
                    };
                })
                .concat([
                    new inquirer.Separator(),
                    {
                        name: "This page doesn't need a slug",
                        value: undefined
                    }
                ])
        },
        {
            type: 'input',
            name: 'pagePath',
            message: (answers) => {
                const slugMessage =
                    answers.slugField &&
                    ` The ${chalk.underline(
                        '{slug}'
                    )} placeholder will be replaced by a URL-friendly representation of the ${chalk.underline(answers.slugField)} field`;

                return `Choose a path for the page.${chalk.dim(slugMessage)}`;
            },
            default: (answers) => (answers.slugField ? `/${model.modelName}/{slug}` : `/${model.modelName}`)
        }
    ]);

    return {
        ...setupData,
        pages: setupData.pages.concat({
            pagePath,
            slugField,
            __model: model
        })
    };
};

module.exports.getSetupForProp = async ({ chalk, data, inquirer, model, setupData }) => {
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'isMultiple',
            message: `Do you want to include multiple entries in the same file? ${chalk.reset.dim(
                `If so, multiple entries of ${model.modelName} will be added as an array to the file; if not, only one entry will be kept.`
            )}`,
            default: true
        },
        {
            type: 'input',
            name: 'propName',
            message: `Choose a name for the prop. ${chalk.reset.dim(
                'This will be how the prop can be accessed in your React components.'
            )}`,
            default: model.modelName
        }
    ]);

    answers.__model = model;

    return {
        ...setupData,
        commonProps: setupData.commonProps.concat(answers)
    };
};
