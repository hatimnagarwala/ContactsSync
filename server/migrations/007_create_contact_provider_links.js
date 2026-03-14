/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('contact_provider_links', {
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
    provider: {
      type: 'varchar(20)',
      notNull: true,
    },
    provider_id: {
      type: 'varchar(500)',
      notNull: true,
    },
    provider_etag: {
      type: 'varchar(500)',
    },
    last_synced_at: {
      type: 'timestamptz',
    },
    raw_data: {
      type: 'jsonb',
    },
  });

  pgm.createIndex('contact_provider_links', 'contact_id');
  pgm.addConstraint('contact_provider_links', 'contact_provider_links_provider_provider_id_unique', {
    unique: ['provider', 'provider_id'],
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('contact_provider_links');
};
