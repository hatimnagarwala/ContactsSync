/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('contacts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    given_name: {
      type: 'varchar(255)',
    },
    family_name: {
      type: 'varchar(255)',
    },
    middle_name: {
      type: 'varchar(255)',
    },
    display_name: {
      type: 'varchar(500)',
    },
    prefix: {
      type: 'varchar(50)',
    },
    suffix: {
      type: 'varchar(50)',
    },
    nickname: {
      type: 'varchar(255)',
    },
    company: {
      type: 'varchar(255)',
    },
    job_title: {
      type: 'varchar(255)',
    },
    department: {
      type: 'varchar(255)',
    },
    birthday: {
      type: 'date',
    },
    notes: {
      type: 'text',
    },
    photo_url: {
      type: 'text',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    deleted_at: {
      type: 'timestamptz',
    },
  });

  pgm.createIndex('contacts', 'user_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('contacts');
};
