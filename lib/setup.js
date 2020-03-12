module.exports.getSetupForPage = async ({
  chalk,
  data,
  inquirer,
  model,
  setupData
}) => {
  const { pagePath } = await inquirer.prompt([
    {
      type: "input",
      name: "pagePath",
      message: `Choose a path for the page. ${chalk.dim('You can use curly braces to denote placeholders that will be replaced by page fields – e.g. "/blog/{slug}"')}`,
      default: `/${model.modelName}/{slug}`
    }
  ]);

  return {
    ...setupData,
    pages: setupData.pages.concat({
      pagePath,
      __model: model
    })
  };
};

module.exports.getSetupForProp = async ({
  chalk,
  data,
  inquirer,
  model,
  setupData
}) => {
  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "isMultiple",
      message: `Do you want to include multiple entries in the same file? ${chalk.reset.dim(
        `If so, multiple entries of ${model.modelName} will be added as an array to the file; if not, only one entry will be kept.`
      )}`,
      default: true
    }
  ]);

  answers.__model = model;

  return {
    ...setupData,
    commonProps: setupData.commonProps.concat(answers)
  };
};
