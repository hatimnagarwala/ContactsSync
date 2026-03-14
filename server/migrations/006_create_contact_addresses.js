/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('contact_addresses', {
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
    type: {
      type: 'varchar(50)',
    },
    street: {
      type: 'text',
    },
    city: {
      type: 'varchar(255)',
    },
    region: {
      type: 'varchar(255)',
    },
    postal_code: {
      type: 'varchar(20)',
    },
    country: {
      type: 'varchar(100)',
    },
  });

  pgm.createIndex('contact_addresses', 'contact_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('contact_addresses');
};
