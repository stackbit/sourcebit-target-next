const slugify = require('@sindresorhus/slugify');

module.exports.getOptionsFromSetup = ({ answers, debug }) => {
    const options = {};
    const pageBranches = answers.pages.map((page) => {
        if (!page.__model) return null;

        const conditions = [
            page.__model.modelName && `(object.__metadata.modelName === '${page.__model.modelName}')`,
            page.__model.source && `(object.__metadata.source === '${page.__model.source}')`
        ]
            .filter(Boolean)
            .join(' && ');
        const pageValue = page.slugField ? `{...object, slug: utils.slugify(object['${page.slugField}'])}` : 'object';

        return `  if (${conditions}) {
    return pages.concat({ path: '${page.pagePath}', page: ${pageValue} });
  }`;
    });
    const functionBody = `return objects.reduce((pages, object) => {
${pageBranches.join('\n\n')}

  return pages;
}, [])`;

    debug(functionBody);

    options.pages = new Function('objects', 'utils', functionBody);

    const commonProps = answers.commonProps.reduce((commonProps, propObject) => {
        if (!propObject.__model) return commonProps;

        if (propObject.isMultiple) {
            return commonProps.concat(
                `${propObject.propName}: objects.reduce((acc, object) => object.__metadata.modelName === '${propObject.__model.modelName}' ? acc.concat(object) : acc, [])`
            );
        }

        return commonProps.concat(
            `${propObject.propName}: objects.find(object => object.__metadata.modelName === '${propObject.__model.modelName}')`
        );
    }, []);

    if (commonProps.length > 0) {
        const functionBody = `return {
  ${commonProps.join(',\n  ')}
}`;

        options.commonProps = new Function('objects', 'utils', functionBody);
    }

    return options;
};

module.exports.getSetup = ({ chalk, data, inquirer, log }) => {
    return async () => {
        // We want to exclude the internal `__asset` model from the options.
        const models = data.models.filter((model) => model.modelName !== '__asset');
        const { pageModels: pageModelIndexes } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'pageModels',
                message: 'Which of these models should generate a page?',
                choices: models.map((model, index) => ({
                    name: `${model.modelLabel || model.modelName} ${chalk.dim(`(${model.source})`)}`,
                    short: model.modelLabel || model.modelName,
                    value: index
                }))
            }
        ]);
        const pageModels = pageModelIndexes.map((index) => models[index]);

        let queue = Promise.resolve({ commonProps: [], pages: [] });

        pageModels.forEach((model, index) => {
            queue = queue.then(async (setupData) => {
                console.log(
                    `\nConfiguring page: ${chalk.bold(model.modelLabel || model.modelName)} ${chalk.reset.italic.green(
                        `(${index + 1} of ${pageModels.length}`
                    )})`
                );

                return getSetupForPage({ chalk, data, inquirer, model, setupData });
            });
        });

        await queue;

        console.log('');

        const { propModels: propModelIndexes } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'propModels',
                message: 'Which of these models do you want to include as props to all page components?',
                choices: models.map((model, index) => ({
                    name: `${model.modelLabel || model.modelName} ${chalk.dim(`(${model.source})`)}`,
                    short: model.modelLabel || model.modelName,
                    value: index
                }))
            }
        ]);
        const propModels = propModelIndexes.map((index) => models[index]);

        propModels.forEach((model, index) => {
            queue = queue.then(async (setupData) => {
                console.log(
                    `\nConfiguring common prop: ${chalk.bold(model.modelLabel || model.modelName)} ${chalk.reset.italic.green(
                        `(${index + 1} of ${propModels.length}`
                    )})`
                );

                return getSetupForProp({ chalk, data, inquirer, model, setupData });
            });
        });

        const answers = await queue;

        console.log('');
        log(
            `The Next.js plugin requires some manual configuration. Please see ${chalk.bold(
                'https://github.com/stackbithq/sourcebit-target-next#installation'
            )} for instructions.`,
            'fail'
        );

        return answers;
    };
};

async function getSetupForPage({ chalk, data, inquirer, model, setupData }) {
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
}

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

async function getSetupForProp({ chalk, data, inquirer, model, setupData }) {
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
}
