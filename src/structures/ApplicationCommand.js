'use strict';

const Base = require('./Base');
const ApplicationCommandPermissionsManager = require('../managers/ApplicationCommandPermissionsManager');
const { ApplicationCommandOptionTypes, ApplicationCommandTypes } = require('../util/Constants');
const SnowflakeUtil = require('../util/SnowflakeUtil');

/**
 * Represents an application command.
 * @extends {Base}
 */
class ApplicationCommand extends Base {
  constructor(client, data, guild, guildId) {
    super(client);

    /**
     * The command's id
     * @type {Snowflake}
     */
    this.id = data.id;

    /**
     * The parent application's id
     * @type {Snowflake}
     */
    this.applicationId = data.application_id;

    /**
     * The guild this command is part of
     * @type {?Guild}
     */
    this.guild = guild ?? null;

    /**
     * The guild's id this command is part of, this may be non-null when `guild` is `null` if the command
     * was fetched from the `ApplicationCommandManager`
     * @type {?Snowflake}
     */
    this.guildId = guild?.id ?? guildId ?? null;

    /**
     * The manager for permissions of this command on its guild or arbitrary guilds when the command is global
     * @type {ApplicationCommandPermissionsManager}
     */
    this.permissions = new ApplicationCommandPermissionsManager(this);

    /**
     * The type of this application command
     * @type {ApplicationCommandType}
     */
    this.type = ApplicationCommandTypes[data.type];

    this._patch(data);
  }

  _patch(data) {
    /**
     * The name of this command
     * @type {string}
     */
    this.name = data.name;

    /**
     * The description of this command
     * @type {string}
     */
    this.description = data.description;

    /**
     * The options of this command
     * @type {ApplicationCommandOption[]}
     */
    this.options = data.options?.map(o => this.constructor.transformOption(o, true)) ?? [];

    /**
     * Whether the command is enabled by default when the app is added to a guild
     * @type {boolean}
     */
    this.defaultPermission = data.default_permission;
  }

  /**
   * The timestamp the command was created at
   * @type {number}
   * @readonly
   */
  get createdTimestamp() {
    return SnowflakeUtil.deconstruct(this.id).timestamp;
  }

  /**
   * The time the command was created at
   * @type {Date}
   * @readonly
   */
  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * The manager that this command belongs to
   * @type {ApplicationCommandManager}
   * @readonly
   */
  get manager() {
    return (this.guild ?? this.client.application).commands;
  }

  /**
   * Data for creating or editing an application command.
   * @typedef {Object} ApplicationCommandData
   * @property {string} name The name of the command
   * @property {string} description The description of the command
   * @property {ApplicationCommandType} [type] The type of the command
   * @property {ApplicationCommandOptionData[]} [options] Options for the command
   * @property {boolean} [defaultPermission] Whether the command is enabled by default when the app is added to a guild
   */

  /**
   * An option for an application command or subcommand.
   * @typedef {Object} ApplicationCommandOptionData
   * @property {ApplicationCommandOptionType|number} type The type of the option
   * @property {string} name The name of the option
   * @property {string} description The description of the option
   * @property {boolean} [required] Whether the option is required
   * @property {ApplicationCommandOptionChoice[]} [choices] The choices of the option for the user to pick from
   * @property {ApplicationCommandOptionData[]} [options] Additional options if this option is a subcommand (group)
   */

  /**
   * Edits this application command.
   * @param {ApplicationCommandData} data The data to update the command with
   * @returns {Promise<ApplicationCommand>}
   * @example
   * // Edit the description of this command
   * command.edit({
   *   description: 'New description',
   * })
   *   .then(console.log)
   *   .catch(console.error);
   */
  edit(data) {
    return this.manager.edit(this, data, this.guildId);
  }

  /**
   * Deletes this command.
   * @returns {Promise<ApplicationCommand>}
   * @example
   * // Delete this command
   * command.delete()
   *   .then(console.log)
   *   .catch(console.error);
   */
  delete() {
    return this.manager.delete(this, this.guildId);
  }

  /**
   * Whether this command equals another command. It compares all properties, so for most operations
   * it is advisable to just compare `command.id === command2.id` as it is much faster and is often
   * what most users need.
   * @param {ApplicationCommand|ApplicationCommandData|APIApplicationCommand} command The command to compare with
   * @param {boolean} [enforceOptionOrder=false] Whether to strictly check that options and choices are in the same
   * order in the array <info>The client may not always respect this ordering!</info>
   * @returns {boolean}
   */
  equals(command, enforceOptionOrder = false) {
    // If given an id, check if the id matches
    if (command.id && this.id !== command.id) return false;

    // Check top level parameters
    const commandType = typeof command.type === 'string' ? command.type : ApplicationCommandTypes[command.type];
    if (
      command.name !== this.name ||
      ('description' in command && command.description !== this.description) ||
      (commandType && commandType !== this.type) ||
      // Future proof for options being nullable
      // TODO: remove ?? 0 on each when nullable
      (command.options?.length ?? 0) !== (this.options?.length ?? 0) ||
      (command.defaultPermission ?? command.default_permission ?? true) !== this.defaultPermission
    ) {
      return false;
    }

    if (command.options) {
      return this.constructor.optionsEqual(this.options, command.options, enforceOptionOrder);
    }
    return true;
  }

  /**
   * Recursively checks that all options for an {@link ApplicationCommand} are equal to the provided options.
   * In most cases it is better to compare using {@link ApplicationCommand#equals}
   * @param {ApplicationCommandOptionData[]} existing The options on the existing command,
   * should be {@link ApplicationCommand#options}
   * @param {ApplicationCommandOptionData[]|APIApplicationCommandOption[]} options The options to compare against
   * @param {boolean} [enforceOptionOrder=false] Whether to strictly check that options and choices are in the same
   * order in the array <info>The client may not always respect this ordering!</info>
   * @returns {boolean}
   */
  static optionsEqual(existing, options, enforceOptionOrder = false) {
    if (existing.length !== options.length) return false;
    if (enforceOptionOrder) {
      return existing.every((option, index) => this._optionEquals(option, options[index], enforceOptionOrder));
    }
    const newOptions = new Map(options.map(option => [option.name, option]));
    for (const option of existing) {
      const foundOption = newOptions.get(option.name);
      if (!foundOption || !this._optionEquals(option, foundOption)) return false;
    }
    return true;
  }

  /**
   * Checks that an option for an {@link ApplicationCommand} is equal to the provided option
   * In most cases it is better to compare using {@link ApplicationCommand#equals}
   * @param {ApplicationCommandOptionData} existing The option on the existing command,
   * should be from {@link ApplicationCommand#options}
   * @param {ApplicationCommandOptionData|APIApplicationCommandOption} option The option to compare against
   * @param {boolean} [enforceOptionOrder=false] Whether to strictly check that options or choices are in the same
   * order in their array <info>The client may not always respect this ordering!</info>
   * @returns {boolean}
   * @private
   */
  static _optionEquals(existing, option, enforceOptionOrder = false) {
    const optionType = typeof option.type === 'string' ? option.type : ApplicationCommandOptionTypes[option.type];
    if (
      option.name !== existing.name ||
      optionType !== existing.type ||
      option.description !== existing.description ||
      (option.required ?? (['SUB_COMMAND', 'SUB_COMMAND_GROUP'].includes(optionType) ? undefined : false)) !==
        existing.required ||
      option.choices?.length !== existing.choices?.length ||
      option.options?.length !== existing.options?.length
    ) {
      return false;
    }

    if (existing.choices) {
      if (
        enforceOptionOrder &&
        !existing.choices.every(
          (choice, index) => choice.name === option.choices[index].name && choice.value === option.choices[index].value,
        )
      ) {
        return false;
      }
      if (!enforceOptionOrder) {
        const newChoices = new Map(option.choices.map(choice => [choice.name, choice]));
        for (const choice of existing.choices) {
          const foundChoice = newChoices.get(choice.name);
          if (!foundChoice || foundChoice.value !== choice.value) return false;
        }
      }
    }

    if (existing.options) {
      return this.optionsEqual(existing.options, option.options, enforceOptionOrder);
    }
    return true;
  }

  /**
   * An option for an application command or subcommand.
   * @typedef {Object} ApplicationCommandOption
   * @property {ApplicationCommandOptionType} type The type of the option
   * @property {string} name The name of the option
   * @property {string} description The description of the option
   * @property {boolean} [required] Whether the option is required
   * @property {ApplicationCommandOptionChoice[]} [choices] The choices of the option for the user to pick from
   * @property {ApplicationCommandOption[]} [options] Additional options if this option is a subcommand (group)
   */

  /**
   * A choice for an application command option.
   * @typedef {Object} ApplicationCommandOptionChoice
   * @property {string} name The name of the choice
   * @property {string|number} value The value of the choice
   */

  /**
   * Transforms an {@link ApplicationCommandOptionData} object into something that can be used with the API.
   * @param {ApplicationCommandOptionData} option The option to transform
   * @param {boolean} [received] Whether this option has been received from Discord
   * @returns {APIApplicationCommandOption}
   * @private
   */
  static transformOption(option, received) {
    const stringType = typeof option.type === 'string' ? option.type : ApplicationCommandOptionTypes[option.type];
    return {
      type: typeof option.type === 'number' && !received ? option.type : ApplicationCommandOptionTypes[option.type],
      name: option.name,
      description: option.description,
      required:
        option.required ?? (stringType === 'SUB_COMMAND' || stringType === 'SUB_COMMAND_GROUP' ? undefined : false),
      choices: option.choices,
      options: option.options?.map(o => this.transformOption(o, received)),
    };
  }
}

module.exports = ApplicationCommand;

/* eslint-disable max-len */
/**
 * @external APIApplicationCommand
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-structure}
 */

/**
 * @external APIApplicationCommandOption
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-structure}
 */
