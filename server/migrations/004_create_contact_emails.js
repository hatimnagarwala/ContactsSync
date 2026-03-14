/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('contact_emails', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    contact_id: {
      type: 'uuid',
      notNull: true,
      references: 'contacts',
      onDelete: 'CASCADE',
    },
    email: {
      type: 'varchar(320)',
      notNull: true,
    },
    type: {
      type: 'varchar(50)',
    },
    is_primary: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  pgm.createIndex('contact_emails', 'contact_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('contact_emails');
};
