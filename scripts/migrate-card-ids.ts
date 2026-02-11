import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { ConfigService } from '../src/services/config.service';
import { ProjectService } from '../src/services/project.service';
import { MarkdownService } from '../src/services/markdown.service';
import { generatePrefix } from '../src/utils/prefix';
import { ALL_LANES } from '../src/constants';

const config = ConfigService.getInstance();
const workspacePath = config.workspacePath;
const projectService = new ProjectService(workspacePath);

async function migrate() {
  console.log('Migrating card identifiers...\n');

  const projects = await projectService.listProjects(true);
  const existingPrefixes: string[] = [];

  for (const project of projects) {
    console.log(`Project: ${project.name} (${project.slug})`);

    // Step 1: Assign prefix if missing
    let prefix = project.prefix;
    if (!prefix) {
      prefix = generatePrefix(project.name, existingPrefixes);
      console.log(`  Assigning prefix: ${prefix}`);
    }
    existingPrefixes.push(prefix);

    // Step 2: Collect all cards across all lanes, sorted by created date
    const allCards: Array<{
      slug: string;
      lane: string;
      frontmatter: any;
      content: string;
      created: string;
    }> = [];

    for (const lane of ALL_LANES) {
      const lanePath = join(workspacePath, project.slug, lane);
      let files: string[];
      try {
        files = await readdir(lanePath);
      } catch {
        continue;
      }

      for (const file of files.filter(f => f.endsWith('.md'))) {
        const cardPath = join(lanePath, file);
        const raw = await readFile(cardPath, 'utf-8');
        const { frontmatter, content } = MarkdownService.parse(raw);
        allCards.push({
          slug: file.replace(/\.md$/, ''),
          lane,
          frontmatter,
          content,
          created: frontmatter.created,
        });
      }
    }

    // Sort by created date (ascending)
    allCards.sort((a, b) => a.created.localeCompare(b.created));

    // Step 3: Assign sequential numbers (skip cards that already have one)
    let nextNumber = 1;
    for (const card of allCards) {
      if (card.frontmatter.cardNumber !== undefined) {
        // Already has a number, track the max
        nextNumber = Math.max(nextNumber, card.frontmatter.cardNumber + 1);
        continue;
      }

      card.frontmatter.cardNumber = nextNumber;
      nextNumber++;

      // Write updated card back to disk
      const markdown = MarkdownService.serialize(card.frontmatter, card.content);
      const cardPath = join(workspacePath, project.slug, card.lane, `${card.slug}.md`);
      await writeFile(cardPath, markdown);

      console.log(`  ${prefix}-${card.frontmatter.cardNumber}: ${card.frontmatter.title}`);
    }

    // Step 4: Update _project.json with prefix and nextCardNumber
    const configPath = join(workspacePath, project.slug, '_project.json');
    const configRaw = await readFile(configPath, 'utf-8');
    const projectConfig = JSON.parse(configRaw);
    projectConfig.prefix = prefix;
    projectConfig.nextCardNumber = nextNumber;
    projectConfig.updated = new Date().toISOString();
    await writeFile(configPath, JSON.stringify(projectConfig, null, 2));

    console.log(`  Total cards: ${allCards.length}, Next number: ${nextNumber}\n`);
  }

  console.log('Migration complete!');
}

migrate().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
